import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { beforeEach, describe, expect, it } from 'vitest';
import { EngineError, type Command, type TextLine } from '../src/engine/api.ts';
import { MupdfEngine } from '../src/engine/mupdf/engine.ts';
import { classifyFont, substituteFontName } from '../src/engine/mupdf/text.ts';

/**
 * A page with three lines of 12 pt Times at 14 pt leading (tight, so neighbouring
 * glyph boxes overlap), with quotes and an accented letter: the cases where a
 * careless redaction eats into the next line.
 */
function makeTextPdf({ rotate = 0 }: { rotate?: 0 | 90 | 180 | 270 } = {}): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const times = doc.addSimpleFont(new mupdf.Font('Times-Roman'));
  const bold = doc.addSimpleFont(new mupdf.Font('Helvetica-Bold'));
  const contents = [
    'BT /F1 12 Tf 72 700 Td (First line: "quoted" text.) Tj ET',
    'BT /F1 12 Tf 72 686 Td (Second line, caf\\351 au lait.) Tj ET',
    'BT /F1 12 Tf 72 672 Td (Third line, tight leading.) Tj ET',
    '0.8 0.2 0.1 rg BT /F2 18 Tf 72 620 Td (Bold heading) Tj ET',
  ].join('\n');
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], rotate, { Font: { F1: times, F2: bold } }, contents));
  const buf = doc.saveToBuffer('compress=yes');
  const bytes = new Uint8Array(buf.asUint8Array());
  buf.destroy();
  doc.destroy();
  return bytes;
}

let engine: MupdfEngine;
beforeEach(() => {
  engine = new MupdfEngine();
});

function open(bytes: Uint8Array) {
  const r = engine.open(bytes, 'text.pdf');
  if (r.status !== 'ok') throw new Error('locked');
  return r.info.id;
}

const texts = (id: string) => engine.getTextLines(id, 0).map((l) => l.text);

function editCommand(line: TextLine, text: string): Command {
  return { type: 'replaceText', page: 0, line, text };
}

describe('reading text lines', () => {
  it('finds each line with its text, size, font family and baseline', () => {
    const id = open(makeTextPdf());
    const lines = engine.getTextLines(id, 0);
    expect(lines.map((l) => l.text)).toEqual([
      'First line: "quoted" text.',
      'Second line, café au lait.',
      'Third line, tight leading.',
      'Bold heading',
    ]);
    const [first, , , heading] = lines;
    expect(first!.size).toBeCloseTo(12);
    expect(first!.font.family).toBe('serif');
    expect(first!.origin[1]).toBeCloseTo(842 - 700); // page space: y measured from the top
    expect(first!.editable).toBe(true);
    expect(heading!.font).toMatchObject({ family: 'sans', bold: true });
    expect(heading!.color[0]).toBeCloseTo(0.8, 1);
  });

  it('reports lines on rotated pages in upright page space, so they stay editable', () => {
    const id = open(makeTextPdf({ rotate: 90 }));
    const lines = engine.getTextLines(id, 0);
    // The PDF text runs along the page, but the page itself is shown rotated, so it reads vertically.
    expect(lines.every((l) => !l.editable)).toBe(true);
  });
});

describe('replacing a line', () => {
  it('changes only that line, even with tight leading, quotes and accents nearby', () => {
    const id = open(makeTextPdf());
    const second = engine.getTextLines(id, 0)[1]!;
    const info = engine.run(id, editCommand(second, 'Second line, now edited.'));
    expect(texts(id)).toEqual([
      'First line: "quoted" text.',
      'Second line, now edited.',
      'Third line, tight leading.',
      'Bold heading',
    ]);
    expect(info.undoLabel).toBe('Edit text');
    expect(info.pages[0]!.revision).toBeGreaterThan(0);
  });

  it('keeps the baseline, size and font family', () => {
    const id = open(makeTextPdf());
    const [, second] = engine.getTextLines(id, 0);
    engine.run(id, editCommand(second!, 'Moved?'));
    const edited = engine.getTextLines(id, 0).find((l) => l.text === 'Moved?')!;
    expect(edited.origin[0]).toBeCloseTo(second!.origin[0], 1);
    expect(edited.origin[1]).toBeCloseTo(second!.origin[1], 1);
    expect(edited.size).toBeCloseTo(12);
    expect(edited.font.family).toBe('serif');
  });

  it('keeps colour and boldness', () => {
    const id = open(makeTextPdf());
    const heading = engine.getTextLines(id, 0)[3]!;
    engine.run(id, editCommand(heading, 'New heading'));
    const edited = engine.getTextLines(id, 0)[3]!;
    expect(edited.text).toBe('New heading');
    expect(edited.font).toMatchObject({ family: 'sans', bold: true });
    expect(edited.color[0]).toBeCloseTo(0.8, 1);
  });

  it('deletes a line when the new text is empty', () => {
    const id = open(makeTextPdf());
    const third = engine.getTextLines(id, 0)[2]!;
    expect(engine.run(id, editCommand(third, '')).undoLabel).toBe('Delete text');
    expect(texts(id)).toEqual(['First line: "quoted" text.', 'Second line, café au lait.', 'Bold heading']);
  });

  it('refuses characters the substitute font cannot draw, and changes nothing', () => {
    const id = open(makeTextPdf());
    const first = engine.getTextLines(id, 0)[0]!;
    try {
      engine.run(id, editCommand(first, 'Price: ₹ 1,250'));
      throw new Error('expected an error');
    } catch (err) {
      expect(err).toBeInstanceOf(EngineError);
      expect((err as EngineError).message).toContain('"₹"');
    }
    expect(texts(id)[0]).toBe('First line: "quoted" text.');
    expect(engine.getInfo(id).undoLabel).toBeNull();
  });

  it('rejects line breaks', () => {
    const id = open(makeTextPdf());
    const first = engine.getTextLines(id, 0)[0]!;
    expect(() => engine.run(id, editCommand(first, 'two\nlines'))).toThrow(/line breaks/);
  });

  it('undoes and redoes an edit', () => {
    const id = open(makeTextPdf());
    engine.run(id, editCommand(engine.getTextLines(id, 0)[1]!, 'Changed'));
    engine.undo(id);
    expect(texts(id)[1]).toBe('Second line, café au lait.');
    engine.redo(id);
    expect(texts(id)[1]).toBe('Changed');
  });

  it('survives save and reopen, with the new text still selectable', () => {
    const id = open(makeTextPdf());
    engine.run(id, editCommand(engine.getTextLines(id, 0)[0]!, 'Saved edit, with “curly” quotes'));
    const reopened = open(engine.save(id).bytes);
    expect(texts(reopened)[0]).toBe('Saved edit, with “curly” quotes');
  });

  it('draws visible ink where the new text is', () => {
    const id = open(makeTextPdf());
    const line = engine.getTextLines(id, 0)[1]!;
    engine.run(id, editCommand(line, 'XXXXXXXXXXXXXXXXXXXXXXXX'));
    const { width, pixels } = engine.render(id, 0, 1);
    const y = Math.round(line.origin[1] - 4);
    let dark = 0;
    for (let x = Math.round(line.bbox[0]); x < Math.round(line.bbox[2]); x++) {
      if (pixels[(y * width + x) * 4]! < 128) dark++;
    }
    expect(dark).toBeGreaterThan(20);
  });

  it('edits correctly on a page shown rotated by 180°', () => {
    const id = open(makeTextPdf({ rotate: 180 }));
    // At 180° the text is upside down on screen, so not editable; flip it back and edit.
    engine.run(id, { type: 'rotatePages', pages: [0], by: 180 });
    const line = engine.getTextLines(id, 0)[0]!;
    expect(line.editable).toBe(true);
    engine.run(id, editCommand(line, 'Upright edit'));
    const edited = engine.getTextLines(id, 0)[0]!;
    expect(edited.text).toBe('Upright edit');
    expect(edited.editable).toBe(true);
  });
});

describe('fonts', () => {
  it('maps families and styles to the standard fonts', () => {
    expect(substituteFontName({ family: 'serif', bold: true, italic: true })).toBe('Times-BoldItalic');
    expect(substituteFontName({ family: 'sans', bold: false, italic: true })).toBe('Helvetica-Oblique');
    expect(substituteFontName({ family: 'mono', bold: true, italic: false })).toBe('Courier-Bold');
  });

  it('classifies fonts by name when flags are missing', () => {
    const named = (name: string) =>
      ({
        getName: () => name,
        isMono: () => false,
        isSerif: () => false,
        isBold: () => false,
        isItalic: () => false,
      }) as unknown as mupdf.Font;
    expect(classifyFont(named('ABCDEF+TimesNewRomanPS-BoldItalicMT'))).toMatchObject({
      name: 'TimesNewRomanPS-BoldItalicMT',
      family: 'serif',
      bold: true,
      italic: true,
    });
    expect(classifyFont(named('Arial-BoldMT'))).toMatchObject({ family: 'sans', bold: true });
    expect(classifyFont(named('NotoSans-Regular'))).toMatchObject({ family: 'sans' });
    expect(classifyFont(named('Consolas'))).toMatchObject({ family: 'mono' });
  });
});

// A real-world style PDF: printed from Chromium, with embedded subset TrueType fonts.
describe('editing a PDF with embedded subset fonts', () => {
  const letter = () =>
    new Uint8Array(readFileSync(new URL('./fixtures/chromium-letter.pdf', import.meta.url)));

  it('edits one line of a paragraph and leaves the lines around it intact', () => {
    const id = open(letter());
    const before = texts(id);
    const target = engine.getTextLines(id, 0).find((l) => l.text.startsWith('below.'))!;
    engine.run(id, editCommand(target, 'below. Payment is due within fourteen days of the invoice date.'));
    const after = texts(id);
    expect(after).toEqual(
      before.map((t) =>
        t === target.text ? 'below. Payment is due within fourteen days of the invoice date.' : t,
      ),
    );
  });

  it('keeps a bold amount bold', () => {
    const id = open(letter());
    const total = engine.getTextLines(id, 0).find((l) => l.text.startsWith('Total due'))!;
    expect(total.font).toMatchObject({ family: 'serif', bold: true });
    engine.run(id, editCommand(total, 'Total due: 3,900.00'));
    const edited = engine.getTextLines(id, 0).find((l) => l.text.startsWith('Total due'))!;
    expect(edited.text).toBe('Total due: 3,900.00');
    expect(edited.font).toMatchObject({ family: 'serif', bold: true });
  });
});
