import { create } from 'zustand';
import type { DocumentInfo, FontFamily, RGB, TextLine } from '../engine/api.ts';

/**
 * App state (docs/ARCHITECTURE.md §8). The engine worker owns the PDF; this
 * store only holds plain snapshots of it plus UI state (zoom, selection, dialogs),
 * which is never part of the document or its undo history.
 */

export interface OpenDoc {
  readonly id: string;
  readonly name: string;
  /** Null when opened from a drop or in the browser build: first save is "Save As". */
  readonly path: string | null;
  readonly info: DocumentInfo;
}

export interface Notice {
  readonly id: number;
  readonly kind: 'info' | 'error';
  readonly text: string;
}

export interface PasswordPrompt {
  readonly docId: string;
  readonly name: string;
  readonly path: string | null;
  readonly error: string | null;
}

/** What a click or drag on a page does. 'select' also lets you fill in form fields. */
export type Tool =
  | 'select'
  | 'editText'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'ink'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'textbox'
  | 'note'
  | 'image'
  | 'signature'
  | 'whiteout'
  | 'redaction';

/** Style used by the drawing tools; each tool remembers its own. */
export interface ToolStyle {
  readonly color: RGB;
  readonly fill: RGB | null;
  readonly width: number;
  readonly fontSize: number;
  readonly font: FontFamily;
  readonly opacity: number;
}

const ink: RGB = [0.76, 0.25, 0.05];
const blue: RGB = [0.11, 0.33, 0.8];
const black: RGB = [0.1, 0.1, 0.1];
const base: ToolStyle = { color: blue, fill: null, width: 2, fontSize: 14, font: 'sans', opacity: 1 };

export const DEFAULT_STYLES: Readonly<Record<Tool, ToolStyle>> = {
  select: base,
  editText: base,
  highlight: { ...base, color: [1, 0.86, 0.2] },
  underline: { ...base, color: [0.8, 0.13, 0.13] },
  strikeout: { ...base, color: [0.8, 0.13, 0.13] },
  ink: { ...base, color: ink, width: 2 },
  rectangle: base,
  ellipse: base,
  line: { ...base, color: black, width: 1.5 },
  arrow: { ...base, color: black, width: 1.5 },
  textbox: { ...base, color: black },
  note: { ...base, color: [1, 0.8, 0.1] },
  image: base,
  signature: { ...base, color: [0.05, 0.12, 0.45], width: 1.5 },
  whiteout: base,
  redaction: base,
};

/** The annotation selected with the Select tool. */
export interface AnnotSelection {
  readonly docId: string;
  readonly pageIndex: number;
  readonly pageKey: number;
  readonly id: string;
}

/** A dialog that a tool needs before it can create something. */
export type PendingDialog =
  | {
      readonly kind: 'signature';
      readonly pageIndex: number;
      readonly rect: readonly [number, number, number, number];
    }
  | {
      readonly kind: 'note';
      readonly pageIndex: number;
      readonly at: readonly [number, number];
      /** Set when editing an existing note. */
      readonly id?: string;
      readonly contents: string;
    }
  | { readonly kind: 'confirmRedactions' };

/** The line being edited with the Edit text tool. */
export interface TextEdit {
  readonly docId: string;
  readonly pageIndex: number;
  readonly pageKey: number;
  readonly revision: number;
  readonly line: TextLine;
}

export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
] as const;
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

export interface AppState {
  readonly doc: OpenDoc | null;
  readonly zoom: number;
  /** When 'width', the viewer recomputes zoom whenever the window resizes. */
  readonly fit: 'width' | null;
  /** Index of the page mostly in view. */
  readonly currentPage: number;
  /** A request for the viewer to scroll; the nonce makes repeated requests for one page work. */
  readonly scrollTarget: { readonly index: number; readonly nonce: number } | null;
  readonly tool: Tool;
  readonly styles: Readonly<Record<Tool, ToolStyle>>;
  readonly textEdit: TextEdit | null;
  readonly selectedAnnot: AnnotSelection | null;
  readonly dialog: PendingDialog | null;
  /** Selected pages, as page keys in document order. Empty = actions use the current page. */
  readonly selection: readonly number[];
  /** Where a Shift-click range starts. */
  readonly selectionAnchor: number | null;
  /** Label of a long operation in progress ("Opening…"), or null. */
  readonly busy: string | null;
  readonly notices: readonly Notice[];
  readonly passwordPrompt: PasswordPrompt | null;
}

export const useApp = create<AppState>(() => ({
  doc: null,
  zoom: 1,
  fit: 'width',
  currentPage: 0,
  scrollTarget: null,
  tool: 'select',
  styles: DEFAULT_STYLES,
  textEdit: null,
  selectedAnnot: null,
  dialog: null,
  selection: [],
  selectionAnchor: null,
  busy: null,
  notices: [],
  passwordPrompt: null,
}));

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Next preset strictly above/below the current zoom (works from any custom value). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const eps = 1e-6;
  if (direction > 0) return ZOOM_STEPS.find((z) => z > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - eps) ?? MIN_ZOOM;
}
