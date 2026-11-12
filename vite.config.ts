import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri sets TAURI_DEV_HOST when developing on a device over the network.
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Keep Rust compiler output visible when running `tauri dev`.
  clearScreen: false,

  server: {
    // Tauri expects a fixed port; fail instead of silently picking another one.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // Don't rebuild the frontend when Rust files change.
      ignored: ['**/src-tauri/**'],
    },
  },

  // The engine worker uses ES modules (MuPDF.js uses top-level await).
  worker: { format: 'es' },

  // MuPDF.js loads its .wasm file relative to its own URL; pre-bundling would break that.
  optimizeDeps: { exclude: ['mupdf'] },

  // Expose TAURI_ENV_* variables (platform, debug) to the frontend.
  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    // WebView2 on Windows is evergreen Chromium, so we can target modern JS.
    target: 'chrome120',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'oxc',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
