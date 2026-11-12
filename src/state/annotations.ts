import type {
  AnnotationChanges,
  AnnotationInfo,
  FieldInfo,
  NewAnnotation,
  PageInfo,
  Point,
  Quad,
  Rect,
} from '../engine/api.ts';
import { getEngine } from '../engine/client.ts';
import { platform } from '../platform/index.ts';
import { usePageData } from '../lib/usePageData.ts';
import { describeError, notify, runCommand } from './actions.ts';
import { useApp, type Tool, type ToolStyle } from './store.ts';

/**
 * Actions for annotations, form fields, redaction and flattening (ADR 0007).
 * Components call these; every document change goes through runCommand.
 */

const get = useApp.getState;
const set = useApp.setState;

// ---------- Reading ----------

const loadAnnots = (docId: string, i: number) => getEngine().getAnnotations(docId, i);
const loadFields = (docId: string, i: number) => getEngine().getFields(docId, i);

export const useAnnotations = (docId: string, page: PageInfo, index: number): AnnotationInfo[] | null =>
  usePageData('annotations', docId, page, index, loadAnnots);

export const useFields = (docId: string, page: PageInfo, index: number): FieldInfo[] | null =>
  usePageData('fields', docId, page, index, loadFields);

export function selectionQuads(pageIndex: number, a: Point, b: Point): Promise<Quad[]> {
  const { doc } = get();
  if (!doc) return Promise.resolve([]);
  return getEngine().getSelectionQuads(doc.id, pageIndex, a, b);
}

// ---------- Style ----------

export function setToolStyle(tool: Tool, changes: Partial<ToolStyle>): void {
  set((s) => ({ styles: { ...s.styles, [tool]: { ...s.styles[tool], ...changes } } }));
}

/** Changes the selected annotation, or (with nothing selected) the current tool's style. */
export async function applyStyle(changes: Partial<ToolStyle>): Promise<void> {
  const { selectedAnnot, tool } = get();
  if (!selectedAnnot) {
    setToolStyle(tool, changes);
    return;
  }
  const annotChanges: AnnotationChanges = {
    ...(changes.color ? { color: changes.color } : {}),
    ...(changes.fill !== undefined ? { fill: changes.fill } : {}),
    ...(changes.width !== undefined ? { width: changes.width } : {}),
    ...(changes.fontSize !== undefined ? { fontSize: changes.fontSize } : {}),
    ...(changes.font ? { font: changes.font } : {}),
    ...(changes.opacity !== undefined ? { opacity: changes.opacity } : {}),
  };
  await updateAnnotation(selectedAnnot.pageIndex, selectedAnnot.id, annotChanges);
}

// ---------- Creating ----------

export const newAnnotationId = () => `ps-${crypto.randomUUID()}`;

/** Adds an annotation and selects it. */
export async function createAnnotation(pageIndex: number, annotation: NewAnnotation): Promise<string | null> {
  const id = newAnnotationId();
  if (!(await runCommand({ type: 'addAnnotation', page: pageIndex, id, annotation }))) return null;
  const { doc } = get();
  const page = doc?.info.pages[pageIndex];
  // Keep the tool for repeated drawing; select what text boxes, images and signatures made.
  if (
    doc &&
    page &&
    ['textbox', 'image', 'signature-image', 'signature-ink', 'note'].includes(annotation.kind)
  ) {
    set({ selectedAnnot: { docId: doc.id, pageIndex, pageKey: page.key, id } });
  }
  return id;
}

/** Image tool: asks for a PNG/JPEG, then fits it into `rect` keeping its aspect ratio. */
export async function insertImage(
  pageIndex: number,
  rect: Rect,
  kind: 'image' | 'signature-image' = 'image',
) {
  try {
    const file = await platform.openImage();
    if (!file) return;
    await placeImage(pageIndex, rect, file.bytes, kind);
  } catch (err) {
    notify('error', describeError(err));
  }
}

export async function placeImage(
  pageIndex: number,
  rect: Rect,
  bytes: Uint8Array,
  kind: 'image' | 'signature-image',
): Promise<void> {
  let size: { width: number; height: number };
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
  } catch {
    notify('error', 'That image could not be read. Use a PNG or JPEG.');
    return;
  }
  await createAnnotation(pageIndex, { kind, rect: fitRect(rect, size, 180), bytes });
}

/**
 * Fits something of `size` inside `rect`, centred, keeping its aspect ratio.
 * A click (no real drag) places it at its natural aspect, `defaultWidth` points wide.
 */
export function fitRect(rect: Rect, size: { width: number; height: number }, defaultWidth: number): Rect {
  const [x0, y0, x1, y1] = rect;
  const aspect = size.width / size.height;
  if (x1 - x0 < 8 && y1 - y0 < 8) {
    const w = defaultWidth;
    const h = w / aspect;
    return [x0, y0, x0 + w, y0 + h];
  }
  const w = x1 - x0;
  const h = y1 - y0;
  if (w / h > aspect) {
    const fw = h * aspect;
    return [x0 + (w - fw) / 2, y0, x0 + (w + fw) / 2, y1];
  }
  const fh = w / aspect;
  return [x0, y0 + (h - fh) / 2, x1, y0 + (h + fh) / 2];
}

// ---------- Changing ----------

export async function updateAnnotation(pageIndex: number, id: string, changes: AnnotationChanges) {
  return runCommand({ type: 'updateAnnotation', page: pageIndex, id, changes });
}

export async function moveAnnotation(pageIndex: number, id: string, dx: number, dy: number) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return true;
  return runCommand({ type: 'moveAnnotation', page: pageIndex, id, dx, dy });
}

export function selectAnnotation(pageIndex: number, id: string | null): void {
  const { doc } = get();
  const page = doc?.info.pages[pageIndex];
  if (!doc || !page || !id) {
    set({ selectedAnnot: null });
    return;
  }
  set({ selectedAnnot: { docId: doc.id, pageIndex, pageKey: page.key, id } });
}

/** Deletes the selected annotation. Returns false if nothing was selected. */
export async function deleteSelectedAnnotation(): Promise<boolean> {
  const sel = get().selectedAnnot;
  if (!sel) return false;
  if (await runCommand({ type: 'deleteAnnotation', page: sel.pageIndex, id: sel.id }))
    set({ selectedAnnot: null });
  return true;
}

export function openNoteEditor(pageIndex: number, annot: AnnotationInfo): void {
  set({
    dialog: {
      kind: 'note',
      pageIndex,
      at: [annot.rect[0], annot.rect[1]],
      id: annot.id,
      contents: annot.contents,
    },
  });
}

// ---------- Whole-document actions ----------

export const askToApplyRedactions = () => set({ dialog: { kind: 'confirmRedactions' } });

export async function applyRedactions(): Promise<void> {
  set({ dialog: null });
  if (await runCommand({ type: 'applyRedactions' })) {
    notify(
      'info',
      'Redactions applied. The marked content has been removed; Undo still brings it back until you save.',
    );
  }
}

export async function flatten(): Promise<void> {
  const ok = await platform.confirm(
    'Flattening merges all annotations and form fields into the pages, so they can no longer be moved or edited. You can undo it until you close the file.',
    { title: 'Flatten annotations?', okLabel: 'Flatten', cancelLabel: 'Cancel' },
  );
  if (ok) await runCommand({ type: 'flatten' });
}

// ---------- Form fields ----------

export async function setFieldValue(
  pageIndex: number,
  id: string,
  value: string | boolean,
): Promise<boolean> {
  return runCommand({ type: 'setFieldValue', page: pageIndex, id, value });
}
