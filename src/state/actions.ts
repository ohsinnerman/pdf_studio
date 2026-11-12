import type { Command, DocumentInfo, TextLine } from '../engine/api.ts';
import { getEngine } from '../engine/client.ts';
import { platform, type OpenedFile, type SaveTarget } from '../platform/index.ts';
import { renderer } from '../render/index.ts';
import { keysToOrder, isIdentity, nextSelection, reorderForDrop } from '../features/thumbnails/reorder.ts';
import { clampZoom, stepZoom, useApp, type Notice, type Tool } from './store.ts';

/**
 * Everything that changes app state goes through these functions, so components
 * stay declarative and the flows (open → password → show) live in one place.
 */

const set = useApp.setState;
const get = useApp.getState;

// ---------- Notices ----------

let noticeId = 1;
export function notify(kind: Notice['kind'], text: string): void {
  const id = noticeId++;
  set((s) => ({ notices: [...s.notices, { id, kind, text }] }));
  setTimeout(() => dismissNotice(id), kind === 'error' ? 8000 : 4000);
}

export function dismissNotice(id: number): void {
  set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
}

/** Turns engine/platform errors into a sentence the user can act on. */
export function describeError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case 'not-a-pdf':
      return "This file isn't a PDF, or it's too damaged to open. Choose a file ending in .pdf.";
    case 'wrong-password':
      return message;
    default:
      return message || 'The action failed.';
  }
}

// ---------- Opening ----------

/** True if it's fine to replace the current document (nothing unsaved, or the user agreed). */
export async function confirmDiscardChanges(): Promise<boolean> {
  const { doc } = get();
  if (!doc?.info.dirty) return true;
  return platform.confirm(`"${doc.name}" has unsaved changes. Discard them?`, {
    title: 'Unsaved changes',
    okLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
  });
}

export async function openFromDialog(): Promise<void> {
  if (get().busy) return;
  if (!(await confirmDiscardChanges())) return;
  try {
    const [file] = await platform.openPdfs();
    if (file) await openFile(file, { confirmed: true });
  } catch (err) {
    notify('error', describeError(err));
  }
}

export async function openFile(file: OpenedFile, { confirmed = false } = {}): Promise<void> {
  if (get().busy) return;
  if (!confirmed && !(await confirmDiscardChanges())) return;
  set({ busy: `Opening ${file.name}…` });
  try {
    const result = await getEngine().open(file.bytes, file.name);
    await closeCurrent();
    if (result.status === 'needs-password') {
      set({ passwordPrompt: { docId: result.id, name: file.name, path: file.path, error: null } });
    } else {
      showDocument(result.info, file.name, file.path);
    }
  } catch (err) {
    notify('error', describeError(err));
  } finally {
    set({ busy: null });
  }
}

export async function submitPassword(password: string): Promise<void> {
  const prompt = get().passwordPrompt;
  if (!prompt) return;
  try {
    const info = await getEngine().authenticate(prompt.docId, password);
    set({ passwordPrompt: null });
    showDocument(info, prompt.name, prompt.path);
  } catch (err) {
    set({ passwordPrompt: { ...prompt, error: describeError(err) } });
  }
}

export async function cancelPassword(): Promise<void> {
  const prompt = get().passwordPrompt;
  if (!prompt) return;
  set({ passwordPrompt: null });
  await getEngine().close(prompt.docId);
}

function showDocument(info: DocumentInfo, name: string, path: string | null) {
  renderer.invalidateStructure();
  set({
    doc: { id: info.id, name, path, info },
    currentPage: 0,
    fit: 'width',
    scrollTarget: null,
    selection: [],
    selectionAnchor: null,
    tool: 'view',
    textEdit: null,
  });
  if (info.wasRepaired)
    notify('info', `${name} was damaged and has been repaired. Saving will write a fixed copy.`);
}

async function closeCurrent(): Promise<void> {
  const { doc } = get();
  if (!doc) return;
  set({ doc: null });
  renderer.invalidateStructure();
  renderer.cache.clearDocument(doc.id);
  await getEngine().close(doc.id);
}

// ---------- View ----------

export function setZoom(zoom: number): void {
  set({ zoom: clampZoom(zoom), fit: null });
}
export const zoomIn = () => setZoom(stepZoom(get().zoom, 1));
export const zoomOut = () => setZoom(stepZoom(get().zoom, -1));
export const fitWidth = () => set({ fit: 'width' });

/** Called by the viewer when fitting to width, so it doesn't clear the fit mode. */
export function setFittedZoom(zoom: number): void {
  set({ zoom: clampZoom(zoom) });
}

export function setCurrentPage(index: number): void {
  if (get().currentPage !== index) set({ currentPage: index });
}

let scrollNonce = 0;
export function goToPage(index: number): void {
  const count = get().doc?.info.pages.length ?? 0;
  if (count === 0) return;
  const clamped = Math.max(0, Math.min(count - 1, index));
  set({ scrollTarget: { index: clamped, nonce: ++scrollNonce }, currentPage: clamped });
}

// ---------- Selection ----------

const pageKeys = () => get().doc?.info.pages.map((p) => p.key) ?? [];

export function clickPage(key: number, mods: { toggle: boolean; range: boolean }): void {
  const { selection, selectionAnchor } = get();
  const next = nextSelection(pageKeys(), selection, selectionAnchor, key, mods);
  set({ selection: next.selection, selectionAnchor: next.anchor });
  const index = pageKeys().indexOf(key);
  if (index >= 0 && !mods.toggle && !mods.range) goToPage(index);
}

export function selectAllPages(): void {
  set({ selection: pageKeys(), selectionAnchor: pageKeys()[0] ?? null });
}

/** Indices the page actions apply to: the selection, or the current page if nothing is selected. */
export function targetIndices(): number[] {
  const { doc, selection, currentPage } = get();
  if (!doc) return [];
  const keys = pageKeys();
  const selected = selection.map((k) => keys.indexOf(k)).filter((i) => i >= 0);
  return selected.length > 0 ? selected.sort((a, b) => a - b) : [Math.min(currentPage, keys.length - 1)];
}

// ---------- Commands ----------

const STRUCTURAL: ReadonlySet<Command['type']> = new Set([
  'deletePages',
  'reorderPages',
  'insertBlankPage',
  'insertDocument',
]);

function applyInfo(info: DocumentInfo, structural: boolean) {
  const { doc, selection, currentPage } = get();
  if (!doc || doc.id !== info.id) return;
  // Page indices may have moved: any render already queued could hit the wrong page.
  if (structural) renderer.invalidateStructure();
  const keys = new Set(info.pages.map((p) => p.key));
  set({
    doc: { ...doc, info },
    selection: selection.filter((k) => keys.has(k)),
    currentPage: Math.min(currentPage, info.pages.length - 1),
  });
}

export async function runCommand(command: Command): Promise<boolean> {
  const { doc } = get();
  if (!doc) return false;
  try {
    applyInfo(await getEngine().run(doc.id, command), STRUCTURAL.has(command.type));
    return true;
  } catch (err) {
    notify('error', describeError(err));
    return false;
  }
}

export async function undo(): Promise<void> {
  const { doc } = get();
  if (!doc?.info.undoLabel) return;
  try {
    // Undo can move or restore pages, so treat it as structural.
    applyInfo(await getEngine().undo(doc.id), true);
  } catch (err) {
    notify('error', describeError(err));
  }
}

export async function redo(): Promise<void> {
  const { doc } = get();
  if (!doc?.info.redoLabel) return;
  try {
    applyInfo(await getEngine().redo(doc.id), true);
  } catch (err) {
    notify('error', describeError(err));
  }
}

// ---------- Page actions ----------

export const rotateTargets = (by: 90 | 270) =>
  runCommand({ type: 'rotatePages', pages: targetIndices(), by });

export async function deleteTargets(): Promise<void> {
  const pages = targetIndices();
  const total = get().doc?.info.pages.length ?? 0;
  if (pages.length >= total) {
    notify('error', 'A PDF needs at least one page. Select fewer pages to delete.');
    return;
  }
  if (await runCommand({ type: 'deletePages', pages })) {
    set({ selection: [], selectionAnchor: null });
  }
}

/** Inserts a blank page after the last target page, the same size as that page. */
export async function insertBlankPage(): Promise<void> {
  const { doc } = get();
  const last = targetIndices().at(-1);
  if (!doc || last === undefined) return;
  const ref = doc.info.pages[last]!;
  // A rotated page reports its visible size; a new page starts unrotated with the same look.
  const [width, height] = ref.rotation % 180 === 0 ? [ref.width, ref.height] : [ref.height, ref.width];
  if (await runCommand({ type: 'insertBlankPage', at: last + 1, width, height })) goToPage(last + 1);
}

/** Asks for another PDF and inserts all its pages after the last target page. */
export async function insertPdf(): Promise<void> {
  const { doc } = get();
  const last = targetIndices().at(-1);
  if (!doc || last === undefined) return;
  try {
    const [file] = await platform.openPdfs();
    if (!file) return;
    set({ busy: `Inserting ${file.name}…` });
    if (await runCommand({ type: 'insertDocument', at: last + 1, bytes: file.bytes, name: file.name })) {
      goToPage(last + 1);
    }
  } catch (err) {
    notify('error', describeError(err));
  } finally {
    set({ busy: null });
  }
}

/** Handles a thumbnail drop. */
export async function movePages(activeKey: number, overKey: number): Promise<void> {
  const keys = pageKeys();
  const newKeys = reorderForDrop(keys, new Set(get().selection), activeKey, overKey);
  const order = keysToOrder(keys, newKeys);
  if (!isIdentity(order)) await runCommand({ type: 'reorderPages', order });
}

// ---------- Saving ----------

/**
 * Save: overwrite the file it came from. A document without a path (dropped,
 * or the browser build) goes through Save As instead.
 */
export async function save(): Promise<boolean> {
  const { doc } = get();
  if (!doc) return false;
  if (!doc.path) return saveAs();
  return writeTo({ name: doc.name, path: doc.path });
}

export async function saveAs(): Promise<boolean> {
  const { doc } = get();
  if (!doc) return false;
  try {
    // Ask first: a cancelled dialog must change nothing.
    const target = await platform.chooseSaveTarget(doc.name);
    return target ? await writeTo(target) : false;
  } catch (err) {
    notify('error', describeError(err));
    return false;
  }
}

async function writeTo(target: SaveTarget): Promise<boolean> {
  const { doc, busy } = get();
  if (!doc || busy) return false;
  set({ busy: `Saving ${target.name}…` });
  try {
    const { bytes, savePoint } = await getEngine().save(doc.id);
    await platform.writePdf(target, bytes);
    // Only now is it really saved.
    const info = await getEngine().markSaved(doc.id, savePoint);
    const current = get().doc;
    if (current?.id === doc.id) {
      set({ doc: { ...current, info, name: target.name, path: target.path ?? current.path } });
    }
    notify('info', `Saved ${target.name}`);
    return true;
  } catch (err) {
    notify('error', `Couldn't save ${target.name}. ${describeError(err)}`);
    return false;
  } finally {
    set({ busy: null });
  }
}

/** Keeps the window title in sync: "• report.pdf — PDF Studio" while there are unsaved changes. */
export function windowTitle(doc: { name: string; info: { dirty: boolean } } | null): string {
  if (!doc) return 'PDF Studio';
  return `${doc.info.dirty ? '• ' : ''}${doc.name} — PDF Studio`;
}

export function installCloseGuard(): () => void {
  return platform.guardClose({
    hasUnsavedChanges: () => !!get().doc?.info.dirty,
    confirmDiscard: () => confirmDiscardChanges(),
  });
}

// ---------- Edit text ----------

export function setTool(tool: Tool): void {
  set({ tool, textEdit: null });
}

export const toggleEditText = () => setTool(get().tool === 'editText' ? 'view' : 'editText');

export function startTextEdit(pageIndex: number, line: TextLine): void {
  const { doc } = get();
  const page = doc?.info.pages[pageIndex];
  if (!doc || !page) return;
  if (!line.editable) {
    notify('info', "Rotated or vertical text can't be edited yet.");
    return;
  }
  set({ textEdit: { docId: doc.id, pageIndex, pageKey: page.key, revision: page.revision, line } });
}

export function cancelTextEdit(): void {
  set({ textEdit: null });
}

/**
 * Applies the edit. Returns false (and keeps the editor open) if the engine
 * refused it, e.g. a character the substitute font can't draw.
 */
export async function commitTextEdit(text: string): Promise<boolean> {
  const edit = get().textEdit;
  if (!edit) return true;
  const { doc } = get();
  const page = doc?.info.pages[edit.pageIndex];
  // The page moved or changed underneath us (undo, another edit): drop this edit rather than guess.
  if (!doc || doc.id !== edit.docId || page?.key !== edit.pageKey || page.revision !== edit.revision) {
    set({ textEdit: null });
    return true;
  }
  if (text === edit.line.text) {
    set({ textEdit: null });
    return true;
  }
  const ok = await runCommand({ type: 'replaceText', page: edit.pageIndex, line: edit.line, text });
  // Only close this editor: the user may already have clicked another line.
  if (ok && get().textEdit === edit) set({ textEdit: null });
  return ok;
}
