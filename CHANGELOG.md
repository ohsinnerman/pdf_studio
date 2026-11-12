# Changelog

All notable changes to PDF Studio. Every commit bumps the patch version while in pre-alpha; see [`docs/VERSIONING.md`](docs/VERSIONING.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
