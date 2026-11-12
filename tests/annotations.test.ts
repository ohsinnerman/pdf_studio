import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { beforeEach, describe, expect, it } from 'vitest';
import { EngineError, type AnnotationInfo, type NewAnnotation } from '../src/engine/api.ts';
import { MupdfEngine } from '../src/engine/mupdf/engine.ts';

/** One page with three lines of text, and (optionally) an annotation made by "another app" with no /NM. */
function makePdf({ foreignAnnot = false } = {}): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font('Helvetica'));
  const contents = [
    'BT /F1 12 Tf 72 700 Td (Alpha line of text) Tj ET',
    'BT /F1 12 Tf 72 680 Td (Secret account 1234) Tj ET',
    'BT /F1 12 Tf 72 660 Td (Gamma line of text) Tj ET',
  ].join('\n');
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: { F1: font } }, contents));
  if (foreignAnnot) {
    const page = doc.loadPage(0);
    const a = page.createAnnotation('Square');
    a.setRect([300, 300, 400, 400]);
    a.update();
    page.getObject().get('Annots').get(0).resolve().delete('NM');
  }
  const buf = doc.saveToBuffer('compress=yes');
  return new Uint8Array(buf.asUint8Array());
}

/** A 4×2 red PNG. */
function png(): Uint8Array {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 4, 2], false);
  pix.clear(255);
  return new Uint8Array(pix.asPNG());
}

let engine: MupdfEngine;
beforeEach(() => {
  engine = new MupdfEngine();
});

function open(bytes: Uint8Array) {
  const r = engine.open(bytes, 't.pdf');
  if (r.status !== 'ok') throw new Error('locked');
  return r.info.id;
}

const add = (id: string, annotId: string, annotation: NewAnnotation) =>
  engine.run(id, { type: 'addAnnotation', page: 0, id: annotId, annotation });
const annots = (id: string) => engine.getAnnotations(id, 0);
const byId = (id: string, annotId: string) => annots(id).find((a) => a.id === annotId)!;
const lines = (id: string) => engine.getTextLines(id, 0).map((l) => l.text);
const red = [1, 0, 0] as const;

function bboxCenter(a: AnnotationInfo) {
  return [(a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2];
}

describe('identity', () => {
  it('names existing annotations that have no /NM, without making the file dirty', () => {
    const id = open(makePdf({ foreignAnnot: true }));
    expect(annots(id).map((a) => a.id)).toEqual(['ps-0-0']);
    expect(engine.getInfo(id).dirty).toBe(false);
  });

  it('keeps ids through save and reopen', () => {
    const id = open(makePdf({ foreignAnnot: true }));
    add(id, 'mine', { kind: 'rectangle', rect: [50, 50, 150, 100], color: red, fill: null, width: 2 });
    const reopened = open(engine.save(id).bytes);
    expect(
      annots(reopened)
        .map((a) => a.id)
        .sort(),
    ).toEqual(['mine', 'ps-0-0']);
  });

  it('refuses a duplicate id', () => {
    const id = open(makePdf());
    add(id, 'x', { kind: 'whiteout', rect: [10, 10, 50, 50] });
    expect(() => add(id, 'x', { kind: 'whiteout', rect: [60, 60, 90, 90] })).toThrow(EngineError);
  });
});

describe('adding each kind', () => {
  it('creates every kind and reports it back with the right kind', () => {
    const id = open(makePdf());
    const [line0] = engine.getTextLines(id, 0);
    const quads = engine.getSelectionQuads(
      id,
      0,
      [line0!.bbox[0], line0!.origin[1] - 4],
      [line0!.bbox[2], line0!.origin[1] - 4],
    );
    expect(quads.length).toBeGreaterThan(0);
    const specs: [string, NewAnnotation][] = [
      ['hl', { kind: 'highlight', quads, color: [1, 0.9, 0.2] }],
      ['ul', { kind: 'underline', quads, color: red }],
      ['so', { kind: 'strikeout', quads, color: red }],
      [
        'ink',
        {
          kind: 'ink',
          strokes: [
            [
              [100, 300],
              [150, 320],
              [200, 300],
            ],
          ],
          color: red,
          width: 2,
        },
      ],
      ['rect', { kind: 'rectangle', rect: [100, 400, 200, 450], color: red, fill: [0, 0, 1], width: 1 }],
      ['ell', { kind: 'ellipse', rect: [220, 400, 320, 450], color: red, fill: null, width: 1 }],
      ['line', { kind: 'line', a: [100, 500], b: [200, 520], color: red, width: 1 }],
      ['arrow', { kind: 'arrow', a: [100, 540], b: [200, 560], color: red, width: 1 }],
      ['note', { kind: 'note', at: [400, 100], contents: 'Check this', color: [1, 0.8, 0] }],
      [
        'tb',
        {
          kind: 'textbox',
          rect: [100, 600, 300, 640],
          contents: 'Hello',
          color: [0, 0, 0],
          fontSize: 14,
          font: 'serif',
        },
      ],
      ['img', { kind: 'image', rect: [350, 600, 450, 650], bytes: png() }],
      [
        'sig',
        {
          kind: 'signature-ink',
          strokes: [
            [
              [350, 700],
              [400, 690],
              [450, 710],
            ],
          ],
          color: [0, 0, 0.5],
          width: 1.5,
        },
      ],
      ['sigimg', { kind: 'signature-image', rect: [350, 720, 450, 760], bytes: png() }],
      ['wo', { kind: 'whiteout', rect: [450, 100, 500, 150] }],
      ['rd', { kind: 'redaction', rect: [450, 200, 500, 250] }],
    ];
    for (const [annotId, spec] of specs) add(id, annotId, spec);
    const kinds = Object.fromEntries(annots(id).map((a) => [a.id, a.kind]));
    expect(kinds).toEqual({
      hl: 'highlight',
      ul: 'underline',
      so: 'strikeout',
      ink: 'ink',
      rect: 'rectangle',
      ell: 'ellipse',
      line: 'line',
      arrow: 'arrow',
      note: 'note',
      tb: 'textbox',
      img: 'image',
      sig: 'signature',
      sigimg: 'signature',
      wo: 'whiteout',
      rd: 'redaction',
    });
    expect(byId(id, 'tb')).toMatchObject({ contents: 'Hello', fontSize: 14, font: 'serif' });
    expect(byId(id, 'note').contents).toBe('Check this');
    expect(byId(id, 'hl').movable).toBe(false);
    expect(byId(id, 'img').resizable).toBe(true);
    // And it all survives a save.
    const reopened = open(engine.save(id).bytes);
    expect(annots(reopened)).toHaveLength(specs.length);
  });

  it('labels the undo step and undoes it', () => {
    const id = open(makePdf());
    const info = add(id, 'tb', {
      kind: 'textbox',
      rect: [100, 100, 200, 140],
      contents: 'x',
      color: [0, 0, 0],
      fontSize: 12,
      font: 'sans',
    });
    expect(info.undoLabel).toBe('Add text box');
    engine.undo(id);
    expect(annots(id)).toHaveLength(0);
  });

  it('rejects unreadable images and empty drawings', () => {
    const id = open(makePdf());
    expect(() =>
      add(id, 'i', { kind: 'image', rect: [0, 0, 50, 50], bytes: new Uint8Array([1, 2, 3]) }),
    ).toThrow(/PNG or JPEG/);
    expect(() => add(id, 'k', { kind: 'ink', strokes: [], color: red, width: 1 })).toThrow(
      /Nothing was drawn/,
    );
  });
});

describe('moving, resizing, editing, deleting', () => {
  it('moves rect-based and vector annotations by the same offset', () => {
    const id = open(makePdf());
    add(id, 'rect', { kind: 'rectangle', rect: [100, 100, 200, 150], color: red, fill: null, width: 1 });
    add(id, 'ink', {
      kind: 'ink',
      strokes: [
        [
          [100, 300],
          [200, 350],
        ],
      ],
      color: red,
      width: 2,
    });
    for (const annotId of ['rect', 'ink']) {
      const before = bboxCenter(byId(id, annotId));
      engine.run(id, { type: 'moveAnnotation', page: 0, id: annotId, dx: 30, dy: -20 });
      const after = bboxCenter(byId(id, annotId));
      expect(after[0]! - before[0]!).toBeCloseTo(30, 0);
      expect(after[1]! - before[1]!).toBeCloseTo(-20, 0);
    }
  });

  it('resizes, scaling ink to the new box', () => {
    const id = open(makePdf());
    add(id, 'ink', {
      kind: 'ink',
      strokes: [
        [
          [100, 100],
          [200, 200],
        ],
      ],
      color: red,
      width: 1,
    });
    const before = byId(id, 'ink').rect;
    const w = before[2] - before[0];
    engine.run(id, {
      type: 'updateAnnotation',
      page: 0,
      id: 'ink',
      changes: { rect: [before[0], before[1], before[0] + w * 2, before[3]] },
    });
    const after = byId(id, 'ink').rect;
    expect(after[2] - after[0]).toBeGreaterThan(w * 1.8);
  });

  it('refuses to move text markup off its text', () => {
    const id = open(makePdf());
    const [l] = engine.getTextLines(id, 0);
    const quads = engine.getSelectionQuads(
      id,
      0,
      [l!.bbox[0], l!.origin[1] - 4],
      [l!.bbox[2], l!.origin[1] - 4],
    );
    add(id, 'hl', { kind: 'highlight', quads, color: [1, 1, 0] });
    expect(() => engine.run(id, { type: 'moveAnnotation', page: 0, id: 'hl', dx: 5, dy: 5 })).toThrow(
      /stays on its text/,
    );
  });

  it('changes a text box text, size, font and colour', () => {
    const id = open(makePdf());
    add(id, 'tb', {
      kind: 'textbox',
      rect: [100, 100, 300, 140],
      contents: 'Old',
      color: [0, 0, 0],
      fontSize: 12,
      font: 'sans',
    });
    engine.run(id, {
      type: 'updateAnnotation',
      page: 0,
      id: 'tb',
      changes: { contents: 'New text', fontSize: 18, font: 'mono', color: [0, 0, 1] },
    });
    expect(byId(id, 'tb')).toMatchObject({ contents: 'New text', fontSize: 18, font: 'mono' });
    expect(byId(id, 'tb').color?.[2]).toBeCloseTo(1);
  });

  it('deletes, and undo brings it back', () => {
    const id = open(makePdf());
    add(id, 'n', { kind: 'note', at: [100, 100], contents: 'hi', color: [1, 1, 0] });
    engine.run(id, { type: 'deleteAnnotation', page: 0, id: 'n' });
    expect(annots(id)).toHaveLength(0);
    engine.undo(id);
    expect(byId(id, 'n').contents).toBe('hi');
  });

  it('replays add/undo/move correctly when saving', () => {
    const id = open(makePdf());
    add(id, 'a', { kind: 'rectangle', rect: [100, 100, 150, 150], color: red, fill: null, width: 1 });
    add(id, 'b', { kind: 'rectangle', rect: [200, 200, 250, 250], color: red, fill: null, width: 1 });
    engine.undo(id);
    add(id, 'c', { kind: 'ellipse', rect: [300, 300, 350, 350], color: red, fill: null, width: 1 });
    engine.run(id, { type: 'moveAnnotation', page: 0, id: 'a', dx: 10, dy: 0 });
    const live = annots(id).map((a) => [a.id, Math.round(a.rect[0])]);
    const saved = annots(open(engine.save(id).bytes)).map((a) => [a.id, Math.round(a.rect[0])]);
    expect(saved).toEqual(live);
  });
});

describe('redaction and whiteout', () => {
  it('whiteout only covers: the text is still in the file', () => {
    const id = open(makePdf());
    const secret = engine.getTextLines(id, 0)[1]!;
    add(id, 'wo', { kind: 'whiteout', rect: secret.bbox });
    expect(lines(id)).toContain('Secret account 1234');
  });

  it('applying redactions removes the text for real, and only under the box', () => {
    const id = open(makePdf());
    const secret = engine.getTextLines(id, 0)[1]!;
    add(id, 'rd', { kind: 'redaction', rect: secret.bbox });
    expect(lines(id)).toContain('Secret account 1234'); // only marked so far
    const info = engine.run(id, { type: 'applyRedactions' });
    expect(info.undoLabel).toBe('Apply redactions');
    expect(lines(id)).toEqual(['Alpha line of text', 'Gamma line of text']);
    expect(annots(id).some((a) => a.kind === 'redaction')).toBe(false);
    const saved = open(engine.save(id).bytes);
    expect(lines(saved).join(' ')).not.toContain('Secret');
    engine.undo(id);
    expect(lines(id)).toContain('Secret account 1234');
  });

  it('refuses to apply when nothing is marked', () => {
    const id = open(makePdf());
    expect(() => engine.run(id, { type: 'applyRedactions' })).toThrow(/no redactions/);
  });
});

describe('flatten', () => {
  it('merges annotations into the page so they are no longer editable', () => {
    const id = open(makePdf());
    add(id, 'r', { kind: 'rectangle', rect: [100, 400, 300, 500], color: red, fill: red, width: 1 });
    engine.run(id, { type: 'flatten' });
    expect(annots(id)).toHaveLength(0);
    const { width, pixels } = engine.render(id, 0, 1);
    const i = (450 * width + 200) * 4;
    expect([pixels[i], pixels[i + 1], pixels[i + 2]]).toEqual([255, 0, 0]);
  });
});

describe('form fields', () => {
  const form = () => new Uint8Array(readFileSync(new URL('./fixtures/form.pdf', import.meta.url)));
  const fields = (id: string) => Object.fromEntries(engine.getFields(id, 0).map((f) => [f.name, f]));

  it('lists text, checkbox, choice and read-only fields', () => {
    const id = open(form());
    const f = fields(id);
    expect(f.name).toMatchObject({ kind: 'text', value: '', readOnly: false });
    expect(f.subscribe).toMatchObject({ kind: 'checkbox', checked: false });
    expect(f.city).toMatchObject({ kind: 'choice', value: 'Mandya' });
    expect(f.city!.options).toEqual(['Mandya', 'Mysuru', 'Bengaluru']);
    expect(f.fixed).toMatchObject({ readOnly: true, value: 'PS-1' });
  });

  it('fills them in, undoably, and the values survive save and reopen', () => {
    const id = open(form());
    const f = fields(id);
    engine.run(id, { type: 'setFieldValue', page: 0, id: f.name!.id, value: 'Akul Shrivastava' });
    engine.run(id, { type: 'setFieldValue', page: 0, id: f.subscribe!.id, value: true });
    const info = engine.run(id, { type: 'setFieldValue', page: 0, id: f.city!.id, value: 'Mysuru' });
    expect(info.undoLabel).toBe('Fill in field');
    const reopened = fields(open(engine.save(id).bytes));
    expect(reopened.name!.value).toBe('Akul Shrivastava');
    expect(reopened.subscribe!.checked).toBe(true);
    expect(reopened.city!.value).toBe('Mysuru');
    engine.undo(id);
    expect(fields(id).city!.value).toBe('Mandya');
  });

  it('refuses read-only fields', () => {
    const id = open(form());
    expect(() =>
      engine.run(id, { type: 'setFieldValue', page: 0, id: fields(id).fixed!.id, value: 'x' }),
    ).toThrow(/read-only/);
  });
});
