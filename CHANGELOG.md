# Changelog

All notable changes to PDF Studio. Every commit bumps the patch version while in pre-alpha; see [`docs/VERSIONING.md`](docs/VERSIONING.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.9-pre-alpha]

### Added

- `docs/DEVELOPMENT.md`: Windows setup (Node, Rust, C++ Build Tools, WebView2), every script, a map of the code, how to make a change, debugging the worker and Rust, troubleshooting.
- `docs/RELEASING.md`: getting the `.exe` from any CI run, publishing a draft GitHub Release from a tag, what's in the installer, and what's deliberately not done yet (signing, auto-update).
- Decision records: `docs/decisions/` with an index and ADRs 0001 (Tauri), 0002 (MuPDF.js) and 0003 (live document + journal), alongside 0004 (save by replay).
- `docs/README.md` (index of all docs), `CONTRIBUTING.md`, and recommended VS Code extensions.

### Changed

- `docs/ARCHITECTURE.md` is now marked accepted and lists what building it taught us: three coordinate spaces, save by replay, two-step saving, the worker ready handshake, and lazily rendered rather than virtualised thumbnails. Roadmap progress is marked.
- README: feature table reflects what works, a Download section, a CI badge, and links to all docs.

### Verified

- A full release `tauri build` compiles and the app starts (Linux, under Xvfb).
- Open → edit → save works end to end in Chromium with the app's exact production Content Security Policy, including the worker, WASM, rendering and download.

## [1.0.8-pre-alpha]

### Added

- **CI** (`.github/workflows/ci.yml`), on every push and pull request:
  - Web checks on Linux: version agreement, typecheck, ESLint, Prettier, tests, frontend build.
  - Rust checks on Windows: rustfmt, clippy with warnings as errors, Rust tests, with a locked `Cargo.lock`.
  - When both pass, a real NSIS installer is built on `windows-latest` and uploaded as a workflow artifact (`pdf-studio-<version>-windows-x64`, kept 30 days).
  - A newer push to the same branch cancels the older run.
- **Release** (`.github/workflows/release.yml`), on a `v*` tag or by hand: checks that the tag matches the app version and that all version files agree, runs the tests, builds with `tauri-action`, and attaches the `.exe` to a **draft** GitHub Release. Versions with a pre-release tag are marked as pre-releases. The release notes explain the SmartScreen prompt for the unsigned installer.
- Dependabot: monthly, grouped updates for npm, Cargo and GitHub Actions.
- Workflows validated with actionlint.

## [1.0.7-pre-alpha]

### Added

- Save (Ctrl+S) overwrites the original file safely. Save As (Ctrl+Shift+S) asks where first. A document with no path (dropped onto the window, or opened in the browser build) goes through Save As automatically.
- An unsaved-changes dot next to the file name, and a window title that shows it too ("• report.pdf — PDF Studio").
- A close guard: closing the window with unsaved changes asks first, and so does opening another file.
- Saved and failed-save notices that say what happened.

### Changed

- **Saving no longer marks the document clean before the file is written.** `engine.save()` now returns the bytes plus a save point, and `engine.markSaved()` is called only after the write succeeds. Before this, a cancelled Save As dialog or a failed disk write would hide unsaved changes.
- The platform API's `savePdf`/`savePdfAs` are replaced by `chooseSaveTarget` (dialog only) and `writePdf` (write only), for the same reason.

## [1.0.6-pre-alpha]

### Added

- Page sidebar with thumbnails. They render lazily, only when scrolled into view and after the main view's pages. The current page's thumbnail follows the main view.
- Selecting pages works like a file manager: click, Ctrl+click to toggle, Shift+click for a range, Ctrl+A for all. Clicking a thumbnail jumps to that page.
- Drag-to-reorder thumbnails with dnd-kit, using mouse or keyboard. Dragging one page of a multi-selection moves the whole selection as a block, keeping its order.
- Page actions for the selection, or the current page when nothing is selected: rotate left or right (Ctrl+[ / Ctrl+]), delete (Delete), insert a blank page of the same size, and insert another PDF after the selection (merge).
- Undo and redo in the toolbar and on the keyboard (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z). Tooltips say what will be undone ("Undo delete 3 pages").
- Pure selection and reorder helpers with 10 tests.

### Changed

- The device pixel ratio hook is shared by the viewer and the sidebar.

## [1.0.5-pre-alpha]

### Added

- PDF viewer:
  - Virtualised page list (TanStack Virtual): only pages near the viewport exist, so a 40-page file keeps about 6 pages in the DOM.
  - Pages render at zoom × 96/72 × device pixel ratio, so they stay sharp on scaled Windows displays. A blurry placeholder shows while the sharp render arrives, so pages never flash blank.
  - Zoom in and out through presets, fit to width (the default, following window size), Ctrl + mouse wheel, Ctrl+= / Ctrl+- / Ctrl+0. The current page stays in place when zooming.
- Render scheduler: one render at a time, visible pages first, off-screen requests cancelled, identical requests shared, and results discarded after a page move. A 384 MB LRU cache of `ImageBitmap`s closes evicted bitmaps to free GPU memory. 9 tests.
- Opening: the toolbar button, Ctrl+O, the empty-state button, or dropping a PDF anywhere on the window. Asks before discarding unsaved changes. Password-protected PDFs get an unlock dialog (native `<dialog>`, focus-trapped, Esc cancels). Damaged files are repaired, with a notice.
- Status bar (page n of N, page size in mm, zoom %, "Repaired on open"), dismissable notices, and a central keyboard-shortcut registry (5 tests).
- App store (Zustand) and actions module. UI state such as zoom never enters the document or its undo history.

### Fixed

- The first call to the engine was silently lost. The worker loads MuPDF's WASM with a top-level `await`, and messages that reach a worker before it listens are dropped. The worker now announces when it's ready, and the client waits for that. The error event is also logged, so a worker that fails to start is no longer silent.

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
