import type { DocumentInfo } from '../engine/api.ts';
import { getEngine } from '../engine/client.ts';
import { platform, type OpenedFile } from '../platform/index.ts';
import { renderer } from '../render/index.ts';
import { clampZoom, stepZoom, useApp, type Notice } from './store.ts';

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
  set({ doc: { id: info.id, name, path, info }, currentPage: 0, fit: 'width', scrollTarget: null });
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
