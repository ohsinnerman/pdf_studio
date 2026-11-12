import * as mupdf from 'mupdf';
import {
  EngineError,
  commandLabel,
  type Command,
  type DocumentId,
  type DocumentInfo,
  type OpenResult,
  type PageInfo,
  type RenderResult,
  type Rotation,
  type SaveOptions,
  type SaveResult,
  type TextLine,
} from '../api.ts';
import { readTextLines, replaceText } from './text.ts';

/**
 * MuPDF-backed engine. Synchronous and single-threaded on purpose: it runs
 * inside a Web Worker (see ../worker.ts), and the tests call it directly in Node.
 */

interface OpenDocument {
  readonly id: DocumentId;
  readonly name: string;
  /** The live document: rendered, edited, journalled. NEVER saved directly (see save()). */
  readonly doc: mupdf.PDFDocument;
  /** The file as it was opened. Saving replays `history` onto a fresh copy of these bytes. */
  readonly original: Uint8Array;
  /** Commands in journal order. history[i] is journal step i. */
  history: Command[];
  authenticated: boolean;
  /** Kept in memory only, to unlock the fresh copy when saving. Never written anywhere. */
  password: string | null;
  /** Journal position at the last save (or at open). Dirty = current position differs. */
  savedPosition: number;
  /** Per-page appearance revision, keyed by page object number. */
  readonly revisions: Map<number, number>;
}

// Full rewrite: drop unreferenced objects, renumber compactly, compress streams.
const FULL_SAVE_OPTIONS = 'garbage=compact,compress=yes';

const normaliseRotation = (deg: number): Rotation => (((deg % 360) + 360) % 360) as Rotation;

export class MupdfEngine {
  private readonly docs = new Map<DocumentId, OpenDocument>();
  private nextId = 1;

  open(bytes: Uint8Array, name: string): OpenResult {
    let doc: mupdf.PDFDocument | null;
    try {
      doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF();
    } catch (err) {
      throw new EngineError('not-a-pdf', `Could not open ${name}: ${messageOf(err)}`);
    }
    if (!doc) throw new EngineError('not-a-pdf', `${name} is not a PDF`);

    const id = `doc-${this.nextId++}`;
    const entry: OpenDocument = {
      id,
      name,
      doc,
      // Copy: the caller's buffer may be transferred or reused.
      original: new Uint8Array(bytes),
      history: [],
      authenticated: !doc.needsPassword(),
      password: null,
      savedPosition: 0,
      revisions: new Map(),
    };
    this.docs.set(id, entry);

    if (!entry.authenticated) return { status: 'needs-password', id };
    this.startJournal(entry);
    return { status: 'ok', info: this.info(entry) };
  }

  authenticate(id: DocumentId, password: string): DocumentInfo {
    const entry = this.entry(id, { requireAuth: false });
    // authenticatePassword returns 0 on failure, a bitmask of granted rights otherwise.
    if (entry.doc.authenticatePassword(password) === 0) {
      throw new EngineError('wrong-password', 'Incorrect password');
    }
    entry.authenticated = true;
    entry.password = password;
    this.startJournal(entry);
    return this.info(entry);
  }

  close(id: DocumentId): void {
    const entry = this.docs.get(id);
    if (!entry) return;
    entry.doc.destroy();
    this.docs.delete(id);
  }

  getInfo(id: DocumentId): DocumentInfo {
    return this.info(this.entry(id));
  }

  getTextLines(id: DocumentId, pageIndex: number): TextLine[] {
    const entry = this.entry(id);
    this.assertPageIndex(entry, pageIndex);
    const page = entry.doc.loadPage(pageIndex);
    try {
      return readTextLines(page);
    } finally {
      page.destroy();
    }
  }

  render(id: DocumentId, pageIndex: number, scale: number): RenderResult {
    const entry = this.entry(id);
    this.assertPageIndex(entry, pageIndex);
    if (!(scale > 0)) throw new EngineError('invalid-command', `Invalid render scale ${scale}`);

    const page = entry.doc.loadPage(pageIndex);
    try {
      // alpha=false gives an opaque white background; showExtras=true draws annotations.
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      try {
        return { width: pixmap.getWidth(), height: pixmap.getHeight(), pixels: rgbToRgba(pixmap) };
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  }

  run(id: DocumentId, command: Command): DocumentInfo {
    const entry = this.entry(id);
    this.validate(entry, command);
    const { doc } = entry;

    const position = doc.getJournal().position;
    doc.beginOperation(commandLabel(command));
    try {
      const changed = applyCommand(doc, command);
      doc.endOperation();
      for (const key of changed) this.bump(entry, key);
    } catch (err) {
      doc.abandonOperation();
      throw err instanceof EngineError ? err : new EngineError('internal', messageOf(err));
    }
    // Like the journal, a new command discards anything that could have been redone.
    entry.history = [...entry.history.slice(0, position), command];
    return this.info(entry);
  }

  undo(id: DocumentId): DocumentInfo {
    const entry = this.entry(id);
    if (!entry.doc.canUndo()) throw new EngineError('nothing-to-undo', 'Nothing to undo');
    entry.doc.undo();
    this.bumpAll(entry);
    return this.info(entry);
  }

  redo(id: DocumentId): DocumentInfo {
    const entry = this.entry(id);
    if (!entry.doc.canRedo()) throw new EngineError('nothing-to-redo', 'Nothing to redo');
    entry.doc.redo();
    this.bumpAll(entry);
    return this.info(entry);
  }

  /**
   * Why replay instead of saving the live document: MuPDF's journal cannot undo
   * past a save. Any saveToBuffer() on the live document (even incremental, even
   * without garbage collection) makes earlier journal steps silently do nothing.
   * See docs/decisions/0004-save-by-replay.md and the "undo after save" tests.
   *
   * So the live document is never saved. Instead we open the original bytes
   * again, replay the commands up to the current journal position, and save that
   * copy. An incremental save is then relative to the original file, which is
   * exactly what "incremental" should mean.
   */
  save(id: DocumentId, options: SaveOptions = {}): SaveResult {
    const entry = this.entry(id);
    const position = entry.doc.getJournal().position;
    const copy = this.openOriginal(entry);
    try {
      for (const command of entry.history.slice(0, position)) applyCommand(copy, command);
      if (copy.countPages() !== entry.doc.countPages()) {
        throw new EngineError('internal', 'Save replay diverged from the open document');
      }
      const incremental = options.incremental && copy.canBeSavedIncrementally();
      const buffer = copy.saveToBuffer(incremental ? 'incremental' : FULL_SAVE_OPTIONS);
      try {
        // Copy out of WASM memory: the view is invalid once the buffer is freed.
        return { bytes: new Uint8Array(buffer.asUint8Array()), savePoint: position };
      } finally {
        buffer.destroy();
      }
    } finally {
      copy.destroy();
    }
  }

  /** Records that the bytes from save() reached the disk. */
  markSaved(id: DocumentId, savePoint: number): DocumentInfo {
    const entry = this.entry(id);
    entry.savedPosition = savePoint;
    return this.info(entry);
  }

  private openOriginal(entry: OpenDocument): mupdf.PDFDocument {
    const copy = mupdf.Document.openDocument(entry.original, 'application/pdf').asPDF();
    if (!copy) throw new EngineError('internal', 'Could not reopen the original file');
    // The user already unlocked the live document in this session; unlock the copy the same way.
    if (copy.needsPassword() && copy.authenticatePassword(entry.password ?? '') === 0) {
      copy.destroy();
      throw new EngineError('wrong-password', 'Could not unlock the file to save it');
    }
    return copy;
  }

  // ---------- Commands ----------

  private validate(entry: OpenDocument, command: Command): void {
    const count = entry.doc.countPages();
    const checkPages = (pages: readonly number[]) => {
      if (pages.length === 0) throw new EngineError('invalid-command', 'No pages selected');
      for (const p of pages) this.assertPageIndex(entry, p);
      if (new Set(pages).size !== pages.length) {
        throw new EngineError('invalid-command', 'Duplicate page in selection');
      }
    };

    switch (command.type) {
      case 'rotatePages':
        checkPages(command.pages);
        return;
      case 'deletePages':
        checkPages(command.pages);
        if (command.pages.length >= count) {
          throw new EngineError('invalid-command', 'A PDF must keep at least one page');
        }
        return;
      case 'reorderPages': {
        const { order } = command;
        const isPermutation =
          order.length === count &&
          new Set(order).size === count &&
          order.every((i) => Number.isInteger(i) && i >= 0 && i < count);
        if (!isPermutation) throw new EngineError('invalid-command', 'Order must list every page once');
        return;
      }
      case 'replaceText': {
        this.assertPageIndex(entry, command.page);
        const [x0, y0, x1, y1] = command.line.bbox;
        if (!(x1 > x0 && y1 > y0)) throw new EngineError('invalid-command', 'Text area is empty');
        if (!(command.line.size > 0 && command.line.size < 1000)) {
          throw new EngineError('invalid-command', 'Bad font size');
        }
        if (/[\r\n]/.test(command.text))
          throw new EngineError('invalid-command', 'A line cannot contain line breaks');
        return;
      }
      case 'insertBlankPage':
      case 'insertDocument':
        if (!Number.isInteger(command.at) || command.at < 0 || command.at > count) {
          throw new EngineError('invalid-command', `Cannot insert at position ${command.at}`);
        }
        if (command.type === 'insertBlankPage' && !(command.width > 0 && command.height > 0)) {
          throw new EngineError('invalid-command', 'Page size must be positive');
        }
        return;
    }
  }

  // ---------- Helpers ----------

  private entry(id: DocumentId, { requireAuth = true } = {}): OpenDocument {
    const entry = this.docs.get(id);
    if (!entry) throw new EngineError('unknown-document', `No open document ${id}`);
    if (requireAuth && !entry.authenticated) {
      throw new EngineError('wrong-password', 'Document is locked');
    }
    return entry;
  }

  private startJournal(entry: OpenDocument): void {
    entry.doc.enableJournal();
    entry.savedPosition = entry.doc.getJournal().position;
  }

  private assertPageIndex(entry: OpenDocument, index: number): void {
    const count = entry.doc.countPages();
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new EngineError('invalid-command', `Page ${index} does not exist (document has ${count})`);
    }
  }

  private bump(entry: OpenDocument, key: number): void {
    entry.revisions.set(key, (entry.revisions.get(key) ?? 0) + 1);
  }

  /** After undo/redo we don't know which pages changed, so invalidate them all. */
  private bumpAll(entry: OpenDocument): void {
    const n = entry.doc.countPages();
    for (let i = 0; i < n; i++) this.bump(entry, entry.doc.findPage(i).asIndirect());
  }

  private info(entry: OpenDocument): DocumentInfo {
    const { doc } = entry;
    const pages: PageInfo[] = [];
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i);
      try {
        const [x0, y0, x1, y1] = page.getBounds();
        const pageObj = page.getObject();
        const rot = pageObj.getInheritable('Rotate');
        const key = pageObj.asIndirect();
        pages.push({
          key,
          revision: entry.revisions.get(key) ?? 0,
          width: x1 - x0,
          height: y1 - y0,
          rotation: normaliseRotation(rot.isNull() ? 0 : rot.asNumber()),
        });
      } finally {
        page.destroy();
      }
    }

    const journal = doc.getJournal();
    return {
      id: entry.id,
      pages,
      title: doc.getMetaData(mupdf.Document.META_INFO_TITLE) || undefined,
      wasRepaired: doc.wasRepaired(),
      dirty: journal.position !== entry.savedPosition,
      undoLabel: doc.canUndo() ? (journal.steps[journal.position - 1] ?? null) : null,
      redoLabel: doc.canRedo() ? (journal.steps[journal.position] ?? null) : null,
    };
  }
}

/**
 * Applies one command to a document and returns the keys of pages whose
 * appearance changed. Used both for live edits and for save replay, so it must
 * be deterministic and must not touch anything outside `doc`.
 */
function applyCommand(doc: mupdf.PDFDocument, command: Command): number[] {
  switch (command.type) {
    case 'rotatePages': {
      const changed: number[] = [];
      for (const index of command.pages) {
        const pageObj = doc.findPage(index);
        // /Rotate can be inherited from a parent node in the page tree.
        const current = pageObj.getInheritable('Rotate');
        const deg = current.isNull() ? 0 : current.asNumber();
        pageObj.put('Rotate', normaliseRotation(deg + command.by));
        changed.push(pageObj.asIndirect());
      }
      return changed;
    }

    case 'deletePages':
      // Delete from the end so earlier indices stay valid.
      for (const index of [...command.pages].sort((a, b) => b - a)) doc.deletePage(index);
      return [];

    case 'reorderPages':
      doc.rearrangePages([...command.order]);
      return [];

    case 'insertBlankPage': {
      const pageObj = doc.addPage([0, 0, command.width, command.height], 0, {}, '');
      doc.insertPage(command.at, pageObj);
      return [];
    }

    case 'replaceText': {
      replaceText(doc, command.page, command);
      return [doc.findPage(command.page).asIndirect()];
    }

    case 'insertDocument': {
      let source: mupdf.PDFDocument | null;
      try {
        source = mupdf.Document.openDocument(command.bytes, 'application/pdf').asPDF();
      } catch (err) {
        throw new EngineError('not-a-pdf', `Could not open ${command.name}: ${messageOf(err)}`);
      }
      if (!source) throw new EngineError('not-a-pdf', `${command.name} is not a PDF`);
      try {
        if (source.needsPassword()) {
          throw new EngineError('invalid-command', `${command.name} is password-protected`);
        }
        // One graft map for the whole document, so shared fonts/images are copied once.
        const map = doc.newGraftMap();
        try {
          const n = source.countPages();
          for (let i = 0; i < n; i++) map.graftPage(command.at + i, source, i);
        } finally {
          map.destroy();
        }
      } finally {
        source.destroy();
      }
      return [];
    }
  }
}

/** MuPDF gives RGB (3 bytes/pixel) when alpha=false; canvas ImageData wants RGBA. */
function rgbToRgba(pixmap: mupdf.Pixmap): Uint8ClampedArray<ArrayBuffer> {
  const w = pixmap.getWidth();
  const h = pixmap.getHeight();
  const stride = pixmap.getStride();
  const src = pixmap.getPixels();
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    let s = y * stride;
    let d = y * w * 4;
    for (let x = 0; x < w; x++) {
      out[d] = src[s]!;
      out[d + 1] = src[s + 1]!;
      out[d + 2] = src[s + 2]!;
      out[d + 3] = 255;
      s += 3;
      d += 4;
    }
  }
  return out;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
