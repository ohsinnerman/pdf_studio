# 0003 — Edit a live document; undo with MuPDF's journal

- **Status:** accepted, amended by [0004](0004-save-by-replay.md) (how saving works)
- **Date:** 2026-11-12
- **Version:** 1.0.2-pre-alpha
- **Detail:** [ARCHITECTURE.md §6](../ARCHITECTURE.md#6-decision-4--the-document--editing-model)

## Context

Where does the truth about the document live while you edit it, and how does undo work?

## Options considered

1. **An operation list replayed on save.** The screen shows the original plus UI-drawn overlays. Simple, but the browser and the PDF engine draw the edits separately, so what you see isn't exactly what gets saved.
2. **A live document.** Every edit is applied to the open MuPDF document at once, inside a journal operation, and the engine re-renders it.

## Decision

Option 2. Every change is a `Command` (`src/engine/api.ts`) applied inside `beginOperation(label)` / `endOperation()`, and undo/redo call the journal. Pages carry a stable `key` (their PDF object number) and a `revision` that bumps when their look may have changed. Render caches are keyed on both.

## Consequences

- ✅ True WYSIWYG: the pixels come from the same engine that writes the file.
- ✅ Undo covers everything, including page deletes and merges, with labels for the menu.
- ✅ UI state (zoom, selection) stays out of the document and out of undo.
- ➖ After undo/redo we don't know which pages changed, so every page's revision bumps. That re-renders the visible pages, which is cheap.
- ➖ Saving the live document breaks the journal. See 0004.
