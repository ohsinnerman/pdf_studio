import { beforeEach, describe, expect, it } from 'vitest';
import { EngineError, type DocumentInfo } from '../src/engine/api.ts';
import { MupdfEngine } from '../src/engine/mupdf/engine.ts';
import { makePdf, pageTexts } from './fixtures/make-pdf.ts';

let engine: MupdfEngine;
beforeEach(() => {
  engine = new MupdfEngine();
});

function openOk(bytes: Uint8Array, name = 'test.pdf'): DocumentInfo {
  const result = engine.open(bytes, name);
  if (result.status !== 'ok') throw new Error('expected an unlocked document');
  return result.info;
}

const texts = (id: string) => pageTexts(engine.save(id));

function expectEngineError(fn: () => unknown, code: EngineError['code']) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`expected EngineError ${code}`);
}

describe('opening', () => {
  it('reads page count, size and rotation', () => {
    const info = openOk(makePdf(3));
    expect(info.pages).toHaveLength(3);
    expect(info.pages[0]).toMatchObject({ width: 595, height: 842, rotation: 0, revision: 0 });
    expect(info.dirty).toBe(false);
    expect(info.undoLabel).toBeNull();
  });

  it('rejects files that are not PDFs', () => {
    expectEngineError(() => engine.open(new TextEncoder().encode('hello'), 'notes.txt'), 'not-a-pdf');
  });

  it('asks for a password, rejects a wrong one, accepts the right one', () => {
    const result = engine.open(makePdf(2, { password: 'secret' }), 'locked.pdf');
    expect(result.status).toBe('needs-password');
    if (result.status !== 'needs-password') return;
    expectEngineError(() => engine.getInfo(result.id), 'wrong-password');
    expectEngineError(() => engine.authenticate(result.id, 'nope'), 'wrong-password');
    expect(engine.authenticate(result.id, 'secret').pages).toHaveLength(2);
  });
});

describe('rendering', () => {
  it('returns an RGBA bitmap at the requested scale', () => {
    const { id } = openOk(makePdf(1));
    const r = engine.render(id, 0, 0.5);
    expect(r.width).toBe(Math.ceil(595 * 0.5));
    expect(r.height).toBe(Math.ceil(842 * 0.5));
    expect(r.pixels.length).toBe(r.width * r.height * 4);
    // Top-left corner is white paper, fully opaque.
    expect([...r.pixels.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    // Somewhere on the page there is dark text.
    let dark = 0;
    for (let i = 0; i < r.pixels.length; i += 4) if (r.pixels[i]! < 100) dark++;
    expect(dark).toBeGreaterThan(50);
  });

  it('rejects bad page indices', () => {
    const { id } = openOk(makePdf(1));
    expectEngineError(() => engine.render(id, 1, 1), 'invalid-command');
  });
});

describe('page commands', () => {
  it('rotates pages, swapping width and height, and bumps their revision', () => {
    const { id } = openOk(makePdf(2));
    const info = engine.run(id, { type: 'rotatePages', pages: [1], by: 90 });
    expect(info.pages[1]).toMatchObject({ rotation: 90, width: 842, height: 595, revision: 1 });
    expect(info.pages[0]).toMatchObject({ rotation: 0, revision: 0 });
    expect(engine.run(id, { type: 'rotatePages', pages: [1], by: 270 }).pages[1]!.rotation).toBe(0);
  });

  it('deletes pages and refuses to delete them all', () => {
    const { id } = openOk(makePdf(4));
    engine.run(id, { type: 'deletePages', pages: [0, 2] });
    expect(texts(id)).toEqual(['Page 2', 'Page 4']);
    expectEngineError(() => engine.run(id, { type: 'deletePages', pages: [0, 1] }), 'invalid-command');
  });

  it('reorders pages and keeps page keys stable', () => {
    const before = openOk(makePdf(3));
    const after = engine.run(before.id, { type: 'reorderPages', order: [2, 0, 1] });
    expect(texts(before.id)).toEqual(['Page 3', 'Page 1', 'Page 2']);
    expect(after.pages.map((p) => p.key)).toEqual([2, 0, 1].map((i) => before.pages[i]!.key));
  });

  it('rejects an order that is not a permutation', () => {
    const { id } = openOk(makePdf(3));
    expectEngineError(() => engine.run(id, { type: 'reorderPages', order: [0, 0, 1] }), 'invalid-command');
    expectEngineError(() => engine.run(id, { type: 'reorderPages', order: [0, 1] }), 'invalid-command');
  });

  it('inserts a blank page of the given size', () => {
    const { id } = openOk(makePdf(2));
    const info = engine.run(id, { type: 'insertBlankPage', at: 1, width: 612, height: 792 });
    expect(info.pages.map((p) => [p.width, p.height])).toEqual([
      [595, 842],
      [612, 792],
      [595, 842],
    ]);
    expect(texts(id)).toEqual(['Page 1', '', 'Page 2']);
  });

  it('inserts another document (merge)', () => {
    const { id } = openOk(makePdf(2));
    engine.run(id, {
      type: 'insertDocument',
      at: 1,
      bytes: makePdf(2, { prefix: 'Other' }),
      name: 'other.pdf',
    });
    expect(texts(id)).toEqual(['Page 1', 'Other 1', 'Other 2', 'Page 2']);
  });

  it('rejects merging a password-protected document', () => {
    const { id } = openOk(makePdf(1));
    const locked = makePdf(1, { password: 'x' });
    expectEngineError(
      () => engine.run(id, { type: 'insertDocument', at: 0, bytes: locked, name: 'locked.pdf' }),
      'invalid-command',
    );
    // A failed command must leave nothing behind in the undo history.
    expect(engine.getInfo(id).undoLabel).toBeNull();
  });
});

// Spike 3 from docs/ARCHITECTURE.md §16: the journal must undo every kind of change.
describe('undo / redo (journal)', () => {
  it('undoes and redoes a mixed sequence of commands, with labels', () => {
    const { id } = openOk(makePdf(3));
    engine.run(id, { type: 'rotatePages', pages: [0], by: 90 });
    engine.run(id, { type: 'deletePages', pages: [1] });
    engine.run(id, { type: 'reorderPages', order: [1, 0] });
    const merged = engine.run(id, {
      type: 'insertDocument',
      at: 0,
      bytes: makePdf(1, { prefix: 'Cover' }),
      name: 'cover.pdf',
    });
    expect(merged.undoLabel).toBe('Insert cover.pdf');
    expect(texts(id)).toEqual(['Cover 1', 'Page 3', 'Page 1']);

    expect(engine.undo(id).undoLabel).toBe('Reorder pages');
    expect(texts(id)).toEqual(['Page 3', 'Page 1']);
    engine.undo(id);
    expect(texts(id)).toEqual(['Page 1', 'Page 3']);
    engine.undo(id);
    expect(texts(id)).toEqual(['Page 1', 'Page 2', 'Page 3']);
    const first = engine.undo(id);
    expect(first.pages[0]!.rotation).toBe(0);
    expect(first.undoLabel).toBeNull();
    expect(first.redoLabel).toBe('Rotate page');
    expectEngineError(() => engine.undo(id), 'nothing-to-undo');

    for (let i = 0; i < 4; i++) engine.redo(id);
    expect(texts(id)).toEqual(['Cover 1', 'Page 3', 'Page 1']);
    expect(engine.getInfo(id).pages[2]!.rotation).toBe(90);
    expectEngineError(() => engine.redo(id), 'nothing-to-redo');
  });

  it('a new command clears the redo history', () => {
    const { id } = openOk(makePdf(2));
    engine.run(id, { type: 'rotatePages', pages: [0], by: 90 });
    engine.undo(id);
    const info = engine.run(id, { type: 'deletePages', pages: [1] });
    expect(info.redoLabel).toBeNull();
  });

  it('bumps every page revision on undo so cached renders are invalidated', () => {
    const { id } = openOk(makePdf(2));
    engine.run(id, { type: 'rotatePages', pages: [0], by: 90 });
    const info = engine.undo(id);
    expect(info.pages.every((p) => p.revision > 0)).toBe(true);
  });
});

describe('saving', () => {
  it('tracks dirty state across edits, saves and undo', () => {
    const { id } = openOk(makePdf(2));
    expect(engine.run(id, { type: 'rotatePages', pages: [0], by: 90 }).dirty).toBe(true);
    engine.save(id);
    expect(engine.getInfo(id).dirty).toBe(false);
    // Undoing past the save point makes the document differ from the file again.
    expect(engine.undo(id).dirty).toBe(true);
    expect(engine.redo(id).dirty).toBe(false);
  });

  // The bug that led to save-by-replay (docs/decisions/0004-save-by-replay.md).
  it('can undo past a save point', () => {
    const { id } = openOk(makePdf(4));
    engine.run(id, { type: 'deletePages', pages: [1] });
    engine.run(id, { type: 'rotatePages', pages: [0], by: 90 });
    engine.save(id);
    engine.run(id, { type: 'deletePages', pages: [0] });
    engine.undo(id);
    engine.undo(id);
    engine.undo(id);
    expect(texts(id)).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4']);
    expect(engine.getInfo(id).pages[0]!.rotation).toBe(0);
    engine.redo(id);
    engine.redo(id);
    engine.redo(id);
    expect(texts(id)).toEqual(['Page 3', 'Page 4']);
  });

  it('saves only the changes up to the current undo position', () => {
    const { id } = openOk(makePdf(3));
    engine.run(id, { type: 'deletePages', pages: [0] });
    engine.run(id, { type: 'deletePages', pages: [0] });
    engine.undo(id);
    expect(pageTexts(engine.save(id))).toEqual(['Page 2', 'Page 3']);
  });

  it('saves a password-protected file it has unlocked', () => {
    const result = engine.open(makePdf(2, { password: 'pw' }), 'locked.pdf');
    if (result.status !== 'needs-password') throw new Error('expected locked');
    engine.authenticate(result.id, 'pw');
    engine.run(result.id, { type: 'deletePages', pages: [0] });
    const saved = engine.save(result.id);
    const reopened = engine.open(saved, 'saved.pdf');
    expect(reopened.status).toBe('needs-password');
  });

  it('round-trips through a full save', () => {
    const { id } = openOk(makePdf(3));
    engine.run(id, { type: 'rotatePages', pages: [2], by: 180 });
    const reopened = openOk(engine.save(id), 'saved.pdf');
    expect(reopened.pages.map((p) => p.rotation)).toEqual([0, 0, 180]);
  });

  it('incremental save appends to the original bytes, even after earlier saves', () => {
    const original = makePdf(2);
    const { id } = openOk(original);
    engine.run(id, { type: 'rotatePages', pages: [0], by: 90 });
    engine.save(id);
    const saved = engine.save(id, { incremental: true });
    expect(saved.length).toBeGreaterThan(original.length);
    expect(saved.slice(0, original.length)).toEqual(original);
    expect(openOk(saved).pages[0]!.rotation).toBe(90);
  });
});

describe('closing', () => {
  it('forgets the document', () => {
    const { id } = openOk(makePdf(1));
    engine.close(id);
    expectEngineError(() => engine.getInfo(id), 'unknown-document');
  });
});
