/**
 * The engine contract. The UI depends on THIS file, never on MuPDF directly
 * (docs/ARCHITECTURE.md §13). Everything here is plain data that can cross a
 * worker boundary via structured clone.
 */

export type DocumentId = string;

/** Rotation in degrees, clockwise, as stored in the PDF's /Rotate. */
export type Rotation = 0 | 90 | 180 | 270;

export interface PageInfo {
  /**
   * Stable identity of the page: survives reordering and deleting other pages.
   * (It is the page's PDF object number.)
   */
  readonly key: number;
  /** Bumps whenever this page's appearance may have changed. Part of every render cache key. */
  readonly revision: number;
  /** Visible size in points, rotation already applied. */
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
}

export interface DocumentInfo {
  readonly id: DocumentId;
  readonly pages: readonly PageInfo[];
  readonly title: string | undefined;
  /** MuPDF had to repair a damaged file while opening it. Saving will produce a fixed file. */
  readonly wasRepaired: boolean;
  /** Has a change that hasn't been saved. */
  readonly dirty: boolean;
  /** Label of the action Undo would revert, or null if there is nothing to undo. */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export type FontFamily = 'sans' | 'serif' | 'mono';

export interface FontStyle {
  /** The PDF's font name without the subset prefix, e.g. "TimesNewRomanPS-BoldMT". */
  readonly name: string;
  readonly family: FontFamily;
  readonly bold: boolean;
  readonly italic: boolean;
}

/** One line of existing text on a page, in page space (points, top-left origin). */
export interface TextLine {
  readonly text: string;
  /** [x0, y0, x1, y1] */
  readonly bbox: readonly [number, number, number, number];
  /** Baseline start of the first character. */
  readonly origin: readonly [number, number];
  /** Font size of the first character, in points. */
  readonly size: number;
  /** RGB, 0..1 */
  readonly color: readonly [number, number, number];
  readonly font: FontStyle;
  /**
   * Characters the line's original font can draw (from a set of common ones).
   * An edit that only uses these is drawn in the original font and looks identical.
   * Empty when the font can't be reused.
   */
  readonly glyphs: string;
  /** False for rotated or vertical text, which can't be edited yet. */
  readonly editable: boolean;
}

export type OpenResult =
  | { readonly status: 'ok'; readonly info: DocumentInfo }
  | { readonly status: 'needs-password'; readonly id: DocumentId };

/** Every change to a document is one of these. See docs/ARCHITECTURE.md §6. */
export type Command =
  | { readonly type: 'rotatePages'; readonly pages: readonly number[]; readonly by: 90 | 180 | 270 }
  | { readonly type: 'deletePages'; readonly pages: readonly number[] }
  /** `order[i]` is the current index of the page that should end up at position i. */
  | { readonly type: 'reorderPages'; readonly order: readonly number[] }
  | {
      readonly type: 'insertBlankPage';
      readonly at: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: 'insertDocument';
      readonly at: number;
      readonly bytes: Uint8Array;
      readonly name: string;
    }
  /**
   * Replaces one line of existing text (as returned by getTextLines): removes its
   * glyphs (text only; images and drawings stay) and draws `text` on the same
   * baseline, size and colour, in a substitute font of the same family. An empty
   * `text` deletes the line. See src/engine/mupdf/text.ts.
   */
  | {
      readonly type: 'replaceText';
      readonly page: number;
      readonly line: Pick<TextLine, 'bbox' | 'origin' | 'size' | 'color'> & {
        readonly font: Pick<FontStyle, 'family' | 'bold' | 'italic'>;
      };
      readonly text: string;
    };

export interface RenderResult {
  /** Bitmap size in device pixels. */
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major, not premultiplied (ready for ImageData). */
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface SaveResult {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Pass to markSaved() once the bytes are safely on disk. */
  readonly savePoint: number;
}

export interface SaveOptions {
  /**
   * Append changes instead of rewriting the file. Keeps digital signatures valid.
   * Default false: a full rewrite, which drops unused objects and compresses streams.
   */
  readonly incremental?: boolean;
}

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export type EngineErrorCode =
  | 'not-a-pdf'
  | 'unknown-document'
  | 'wrong-password'
  | 'invalid-command'
  | 'nothing-to-undo'
  | 'nothing-to-redo'
  | 'internal';

/** What the worker exposes. All methods are async because they cross a thread boundary. */
export interface EngineApi {
  open(bytes: Uint8Array, name: string): Promise<OpenResult>;
  authenticate(id: DocumentId, password: string): Promise<DocumentInfo>;
  close(id: DocumentId): Promise<void>;
  getInfo(id: DocumentId): Promise<DocumentInfo>;
  /** Lines of existing text on a page, for the Edit text tool. */
  getTextLines(id: DocumentId, pageIndex: number): Promise<TextLine[]>;
  /** `scale` is device pixels per point (see `renderScale` in lib/coords.ts). */
  render(id: DocumentId, pageIndex: number, scale: number): Promise<RenderResult>;
  run(id: DocumentId, command: Command): Promise<DocumentInfo>;
  undo(id: DocumentId): Promise<DocumentInfo>;
  redo(id: DocumentId): Promise<DocumentInfo>;
  /**
   * Produces the file bytes. Does NOT mark the document clean: the caller does
   * that with markSaved() after the write succeeded, so a cancelled dialog or a
   * failed write never hides unsaved changes.
   */
  save(id: DocumentId, options?: SaveOptions): Promise<SaveResult>;
  markSaved(id: DocumentId, savePoint: number): Promise<DocumentInfo>;
}

/** Human-readable label for the Edit menu ("Undo Rotate 2 pages"). */
export function commandLabel(command: Command): string {
  const pages = (n: number) => (n === 1 ? 'page' : `${n} pages`);
  switch (command.type) {
    case 'rotatePages':
      return `Rotate ${pages(command.pages.length)}`;
    case 'deletePages':
      return `Delete ${pages(command.pages.length)}`;
    case 'reorderPages':
      return 'Reorder pages';
    case 'insertBlankPage':
      return 'Insert blank page';
    case 'insertDocument':
      return `Insert ${command.name}`;
    case 'replaceText':
      return command.text.trim() === '' ? 'Delete text' : 'Edit text';
  }
}
