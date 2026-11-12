import { create } from 'zustand';
import type { DocumentInfo } from '../engine/api.ts';

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
