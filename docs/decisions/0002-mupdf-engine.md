# 0002 — MuPDF.js as the single PDF engine

- **Status:** accepted
- **Date:** 2026-11-12
- **Version:** 1.0.2-pre-alpha
- **Detail:** [ARCHITECTURE.md §4](../ARCHITECTURE.md#4-decision-2--the-pdf-engine-the-most-important-decision)

## Context

The engine decides which features are easy, hard or impossible. The first plan used pdf.js to view and pdf-lib to edit, because both have permissive licences. The project isn't going to be sold, so licence freedom matters less than capability.

## Options considered

pdf.js + pdf-lib · MuPDF.js (WASM) · PDFium via Rust · PyMuPDF in a Python sidecar · commercial SDKs.

## Decision

MuPDF.js 1.x as the one engine, running in a Web Worker, imported only by `src/engine/`.

## Consequences

- ✅ One parser renders, edits and saves, so the screen and the file can't disagree.
- ✅ True redaction, text geometry, compression and an undo journal are built in. No Python sidecar.
- ➖ AGPL-3.0: the app is AGPL too, and its source must be shared with anyone who receives the `.exe`. A public repo covers that.
- ➖ About 10 MB of WASM, and fewer tutorials than PyMuPDF (whose API maps closely).
- ➖ The journal can't undo past a save of the live document. Worked around in [0004](0004-save-by-replay.md).
