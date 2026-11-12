# Changelog

All notable changes to PDF Studio. Every commit bumps the patch version while in pre-alpha; see [`docs/VERSIONING.md`](docs/VERSIONING.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
