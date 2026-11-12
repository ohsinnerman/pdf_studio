# Changelog

All notable changes to PDF Studio. Every commit bumps the patch version while in pre-alpha; see [`docs/VERSIONING.md`](docs/VERSIONING.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0-pre-alpha]

### Added

- Project scaffold: Tauri 2 desktop shell, React 19 + TypeScript frontend built with Vite.
- Windows NSIS installer target (per-user install, WebView2 bootstrapper).
- App icon in every size Tauri needs.
- `scripts/bump-version.mjs` keeps the version identical in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` and `tauri.conf.json`.
- README, AGPL-3.0 licence, editor and git settings.
