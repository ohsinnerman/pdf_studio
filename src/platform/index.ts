import { isTauri } from '@tauri-apps/api/core';
import type { Platform } from './api.ts';
import { browserPlatform } from './browser.ts';
import { tauriPlatform } from './tauri.ts';

export type { CloseGuard, OpenedFile, Platform, SaveTarget } from './api.ts';
export { baseName, withPdfExtension } from './api.ts';
export { fileToOpened } from './browser.ts';

/** The platform the app is running on: the desktop app, or a browser during development. */
export const platform: Platform = isTauri() ? tauriPlatform : browserPlatform;
