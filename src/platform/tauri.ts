import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, message, open, save } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { baseName, withPdfExtension, type Platform } from './api.ts';

const PDF_FILTER = [{ name: 'PDF documents', extensions: ['pdf'] }];

async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  // Raw body = no JSON/base64 encoding of potentially huge files. See save_atomic in src-tauri/src/lib.rs.
  await invoke('save_atomic', bytes, { headers: { 'x-path': encodeURIComponent(path) } });
}

export const tauriPlatform: Platform = {
  kind: 'tauri',

  async openPdfs({ multiple = false } = {}) {
    const picked = await open({ multiple, directory: false, filters: PDF_FILTER });
    if (!picked) return [];
    const paths = Array.isArray(picked) ? picked : [picked];
    // The dialog adds each picked path to the fs scope, which is what allows these reads.
    return Promise.all(
      paths.map(async (path) => ({ name: baseName(path), path, bytes: await readFile(path) })),
    );
  },

  async chooseSaveTarget(suggestedName) {
    // The dialog adds the chosen path to the fs scope, which is what allows save_atomic to write it.
    const path = await save({ defaultPath: withPdfExtension(suggestedName), filters: PDF_FILTER });
    if (!path) return null;
    return { name: baseName(path), path };
  },

  async writePdf(target, bytes) {
    if (!target.path) throw new Error('Choose where to save the file first');
    await writeAtomic(target.path, bytes);
  },

  confirm(text, { title = 'PDF Studio', okLabel, cancelLabel, kind = 'warning' } = {}) {
    return ask(text, {
      title,
      kind,
      ...(okLabel ? { okLabel } : {}),
      ...(cancelLabel ? { cancelLabel } : {}),
    });
  },

  async alert(text, { title = 'PDF Studio', kind = 'info' } = {}) {
    await message(text, { title, kind });
  },

  async setWindowTitle(title) {
    await getCurrentWindow().setTitle(title);
  },

  guardClose({ hasUnsavedChanges, confirmDiscard }) {
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      if (!hasUnsavedChanges()) return; // close normally
      event.preventDefault();
      if (await confirmDiscard()) await win.destroy();
    });
    return () => void unlisten.then((fn) => fn());
  },
};
