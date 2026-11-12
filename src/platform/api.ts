/**
 * The platform contract: everything the app needs from the operating system.
 * Only src/platform may import Tauri (enforced by ESLint), so swapping Tauri for
 * Electron, or running in a plain browser during development, means writing one
 * more implementation of this interface (docs/ARCHITECTURE.md §13).
 */

export interface OpenedFile {
  /** File name shown in the UI, e.g. "report.pdf". */
  readonly name: string;
  /**
   * Full path on disk, or null when we only have the contents (a dropped file,
   * or the browser build). A document without a path is saved with "Save As".
   */
  readonly path: string | null;
  readonly bytes: Uint8Array;
}

export interface SavedFile {
  readonly name: string;
  readonly path: string | null;
}

export interface ConfirmOptions {
  readonly title?: string;
  readonly okLabel?: string;
  readonly cancelLabel?: string;
  readonly kind?: 'info' | 'warning';
}

export interface CloseGuard {
  readonly hasUnsavedChanges: () => boolean;
  /** Resolves true if the user agrees to close and lose unsaved changes. */
  readonly confirmDiscard: () => Promise<boolean>;
}

export interface Platform {
  readonly kind: 'tauri' | 'browser';
  /** Shows an Open dialog for PDFs. Returns an empty list if the user cancels. */
  openPdfs(options?: { multiple?: boolean }): Promise<OpenedFile[]>;
  /** Overwrites an existing file safely (temp file + rename). Only for paths the user picked. */
  savePdf(path: string, bytes: Uint8Array): Promise<void>;
  /** Shows a Save dialog and writes the file. Returns null if the user cancels. */
  savePdfAs(suggestedName: string, bytes: Uint8Array): Promise<SavedFile | null>;
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  alert(message: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<void>;
  setWindowTitle(title: string): Promise<void>;
  /**
   * Guards closing the window. If `hasUnsavedChanges()` is true, `confirmDiscard()`
   * decides (the desktop app can show our own dialog; browsers only allow their
   * built-in "Leave site?" prompt). Returns an unsubscribe function.
   */
  guardClose(guard: CloseGuard): () => void;
}

/** "C:\\docs\\report.pdf" or "/home/a/report.pdf" -> "report.pdf" */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Adds ".pdf" unless the name already ends with it (any case). */
export function withPdfExtension(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
