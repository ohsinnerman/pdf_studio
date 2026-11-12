# 0001 — Tauri 2 as the desktop shell

- **Status:** accepted
- **Date:** 2026-11-12
- **Version:** 1.0.0-pre-alpha
- **Detail:** [ARCHITECTURE.md §3](../ARCHITECTURE.md#3-decision-1--the-app-shell-how-a-web-ui-becomes-a-exe)

## Context

We want a Windows `.exe` with a React UI. It should be small, start fast, and have very little native code, since the author knows TypeScript well and Rust less well.

## Options considered

Tauri 2, Electron, Wails (Go), native .NET (WPF/WinUI), Qt, Flutter, a browser PWA.

## Decision

Tauri 2, with Rust kept to glue code: plugin setup and one `save_atomic` command.

## Consequences

- ✅ About 15 MB installer, fast start, low memory. WebView2 is Chromium, so rendering is consistent.
- ✅ The capability system means the frontend can only do what `src-tauri/capabilities/default.json` allows.
- ➖ A small amount of Rust to learn and maintain.
- 🔁 Escape hatch: all OS access goes through `src/platform/`. Moving to Electron would mean one new file there.
