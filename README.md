<p align="center">
  <img src="public/icon.svg" width="96" alt="PDF Studio icon" />
</p>

<h1 align="center">PDF Studio</h1>

<p align="center">
  A free, offline PDF editor for Windows. Your files never leave your computer.
</p>

<p align="center">
  <a href="https://github.com/ohsinnerman/pdf_studio/actions/workflows/ci.yml"><img src="https://github.com/ohsinnerman/pdf_studio/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
</p>

<p align="center">
  <b>Status: pre-alpha</b> — usable for experiments, not yet for important documents.
</p>

---

## Why

Editing a PDF usually means paying for Acrobat or uploading a private document to a website you don't trust. PDF Studio is a small desktop app that does the common jobs locally: reorder and rotate pages, merge files, annotate, fill forms, redact properly, compress.

## Features

|                                                                                                                                       | Status            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Open PDFs: dialog, Ctrl+O, drag-and-drop, password-protected files                                                                    | ✅                |
| Smooth viewer for big files: virtualised, sharp on scaled displays, zoom and fit width                                                | ✅                |
| Page thumbnails: select, drag to reorder                                                                                              | ✅                |
| Rotate, delete, insert blank page, insert another PDF (merge)                                                                         | ✅                |
| **Edit existing text**: click a line, retype it; keeps the original font where it can; change size, colour, bold, italic; ₹ supported | ✅                |
| Undo / redo for every change, even after saving                                                                                       | ✅                |
| Safe saving: temp file + rename, never corrupts the original                                                                          | ✅                |
| Highlight, underline, strike through, draw, rectangles, ellipses, lines, arrows, text boxes, sticky notes, images                     | ✅                |
| Select, move, resize, restyle and delete anything you added                                                                           | ✅                |
| Signatures (draw, type or image; remembered on this computer if you want)                                                             | ✅                |
| Fill in PDF forms (text, checkboxes, drop-downs)                                                                                      | ✅                |
| Cover (whiteout) and true redaction that removes content from the file; flatten                                                       | ✅                |
| Compression, images → PDF, PDF → images                                                                                               | planned (Phase 2) |
| OCR; Hindi and other Indic scripts in text edits; multi-line paragraphs                                                               | planned (Phase 3) |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it's built, and the [roadmap](docs/ARCHITECTURE.md#16-roadmap-revised).

## Download

Every CI run builds a Windows installer: open the latest green run under **Actions** and download the **Artifacts**. Tagged versions appear under **Releases**. The installer isn't code-signed, so SmartScreen will ask; choose **More info → Run anyway**. Details: [`docs/RELEASING.md`](docs/RELEASING.md).

## Tech

[Tauri 2](https://tauri.app) · React 19 + TypeScript · [MuPDF.js](https://mupdf.readthedocs.io) (WebAssembly) in a Web Worker · Zustand · Vite.

## Getting started

Requirements: Node.js 22.12+, Rust (stable), and on Windows the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Microsoft C++ Build Tools and WebView2).

```bash
npm install
npm run app:dev     # run the desktop app with hot reload
npm run app:build   # build the Windows installer (.exe) into src-tauri/target/release/bundle/nsis
```

Full setup, scripts and troubleshooting: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). All docs: [`docs/README.md`](docs/README.md). Design system: [`DESIGN.md`](DESIGN.md).

## Versioning

Every commit bumps the patch version while the app is in pre-alpha (`1.0.0-pre-alpha`, `1.0.1-pre-alpha`, …). Details: [`docs/VERSIONING.md`](docs/VERSIONING.md). Changes are listed in [`CHANGELOG.md`](CHANGELOG.md).

## Licence

[AGPL-3.0-or-later](LICENSE). PDF Studio uses MuPDF, which is AGPL-licensed, so the app is too. You can use it, change it and share it; if you share a modified version, share its source as well.

Bundled fonts: [Noto Sans](https://notofonts.github.io) and [Geist](https://vercel.com/font), both under the [SIL Open Font License 1.1](src/assets/fonts/OFL.txt).
