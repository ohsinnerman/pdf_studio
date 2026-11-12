import { withPdfExtension, type OpenedFile, type Platform } from './api.ts';

/**
 * Fallback for running the UI in a normal browser (`npm run dev`, screenshots,
 * UI tests). No file paths exist here: opening uses a file input, saving
 * downloads the file.
 */

function pickFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.multiple = multiple;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

export async function fileToOpened(file: File): Promise<OpenedFile> {
  return { name: file.name, path: null, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function download(name: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const browserPlatform: Platform = {
  kind: 'browser',

  async openPdfs({ multiple = false } = {}) {
    return Promise.all((await pickFiles(multiple)).map(fileToOpened));
  },

  async chooseSaveTarget(suggestedName) {
    // Browsers decide where downloads go; we can only suggest the name.
    return { name: withPdfExtension(suggestedName), path: null };
  },

  async writePdf(target, bytes) {
    download(target.name, bytes);
  },

  async confirm(message) {
    return window.confirm(message);
  },

  async alert(message) {
    window.alert(message);
  },

  async setWindowTitle(title) {
    document.title = title;
  },

  guardClose({ hasUnsavedChanges }) {
    // Browsers only allow their own generic "Leave site?" prompt, decided synchronously.
    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  },
};
