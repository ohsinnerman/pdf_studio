# Changelog

All notable changes to PDF Studio. Every commit bumps the patch version while in pre-alpha; see [`docs/VERSIONING.md`](docs/VERSIONING.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.4-pre-alpha]

### Added

- `DESIGN.md`, the design system. The light theme adapts Cursor's warm-paper DESIGN.md and the dark theme adapts Warp's warm charcoal, both from awesome-design-md. System, motion and copy rules come from taste-skill. One signal-orange accent, no violet, hairlines instead of shadows, desktop density.
- `src/styles/tokens.css`, mirroring every token, with light, dark and follow-the-OS modes. All text pairs meet WCAG AA contrast; the accent and muted greys were darkened to get there.
- Bundled Geist and Geist Mono variable fonts, so no font requests are made.
- Base components: `Button` (primary, secondary, ghost), `IconButton` (accessible name and shortcut tooltip required), `Toolbar` groups, and the app mark. Hover lifts 1px and press sinks with a slight scale, only for a real mouse, and nothing moves under reduced motion.
- App shell (toolbar, viewport, status bar) and the empty state.

## [1.0.3-pre-alpha]

### Added

- Platform layer (`src/platform/`), the only code allowed to touch Tauri:
  - Desktop: native Open and Save dialogs, file reading through the fs plugin, window title, and a close guard that asks before discarding unsaved changes.
  - Browser fallback for development and UI screenshots: a file picker to open, a download to save, and the browser's own "Leave site?" prompt.
- `save_atomic` Rust command: writes to a hidden temp file in the same folder, flushes it, then renames it over the original. It retries when OneDrive or antivirus briefly locks the file, cleans up on failure, and accepts raw bytes over IPC with no base64. It refuses any path the user didn't pick in a dialog. 4 Rust tests.
- Content Security Policy for release builds: no network access, WebAssembly allowed, no plugins or forms.
- Least-privilege capabilities: only the dialog, read-file, title and close permissions the app uses.
- `npm run check:rust` runs rustfmt, clippy (warnings are errors) and the Rust tests.

### Changed

- Window drag-and-drop is handled by the web page instead of Tauri, so dropped files arrive as contents without paths. Those documents are saved with Save As.

## [1.0.2-pre-alpha]

### Added

- PDF engine (`src/engine/`) built on MuPDF.js 1.28 (WebAssembly):
  - `api.ts`, the plain-data contract the UI depends on: documents, pages with stable keys and revisions, commands, errors with codes.
  - `mupdf/engine.ts`: open (including password-protected files), page info, RGBA rendering at any scale, and the commands rotate, delete, reorder, insert blank page and insert another PDF (merge).
  - Undo and redo through MuPDF's journal, with labels for the Edit menu ("Undo Rotate 2 pages").
  - Dirty tracking against the last save point.
  - `worker.ts` + `client.ts`: the engine runs in a Web Worker, called through Comlink, with zero-copy transfer of bitmaps and saved bytes.
- 22 engine tests that run headless in Node against PDFs generated on the fly, including Spike 3 (undo/redo across every command type).

### Fixed (found by Spike 3, before release)

- MuPDF can't undo past a save of the live document. Saving now replays the command history onto a fresh copy of the original file, so undo works across saves and incremental saves always append to the original. See `docs/decisions/0004-save-by-replay.md`.

## [1.0.1-pre-alpha]

### Added

- `src/lib/coords.ts`: the single module for coordinate conversion. Branded types (`PdfPoint`, `PagePoint`, `ScreenPoint`) make mixing PDF, page and screen coordinates a compile error. Covers zoom, device pixel ratio, canvas size limits and page rotation, with 19 unit tests.
- Tooling: ESLint (with a rule enforcing that only `src/engine` imports MuPDF and only `src/platform` imports Tauri), Prettier, Vitest, and `npm run check` to run everything.

### Changed

- Formatted existing Markdown with Prettier.

## [1.0.0-pre-alpha]

### Added

- Project scaffold: Tauri 2 desktop shell, React 19 + TypeScript frontend built with Vite.
- Windows NSIS installer target (per-user install, WebView2 bootstrapper).
- App icon in every size Tauri needs.
- `scripts/bump-version.mjs` keeps the version identical in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` and `tauri.conf.json`.
- README, AGPL-3.0 licence, editor and git settings.
