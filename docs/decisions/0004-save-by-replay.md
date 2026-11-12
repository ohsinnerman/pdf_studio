# 0004 — Save by replaying commands onto a fresh copy

- **Status:** accepted
- **Date:** 2026-11-12
- **Version:** 1.0.2-pre-alpha
- **Amends:** [ARCHITECTURE.md §6](../ARCHITECTURE.md#6-decision-4--the-document--editing-model) and §9

## Context

The architecture keeps one live MuPDF document per open file. Edits happen on it inside journal operations, and MuPDF's journal gives us undo and redo. The original plan was to save by calling `saveToBuffer()` on that live document.

Spike 3 (the journal spike) tested this and found a problem. **After any `saveToBuffer()` call on the live document, undo stops working for every step recorded before the save.** The journal position still moves and `canUndo()` still returns true, but nothing in the document changes. Steps recorded _after_ the save undo and redo correctly.

Measured with MuPDF.js 1.28.6, deleting a page, saving, then undoing:

| Save options                   | Undo after save                     |
| ------------------------------ | ----------------------------------- |
| `""` (plain)                   | broken                              |
| `compress=yes`                 | broken                              |
| `incremental`                  | broken                              |
| `garbage=1`                    | broken                              |
| `garbage=compact,compress=yes` | broken (and corrupts the page tree) |

We also confirmed that `new PDFDocument(doc)` doesn't help: it shares the same underlying document rather than copying it.

## Options considered

1. **Treat a save as an undo barrier.** Disable Undo at the save point. Simple, but you lose undo every time you press Ctrl+S, which is a worse experience than Acrobat or any text editor.
2. **Reopen after every save.** Load the saved bytes as a new live document and start a fresh journal. Same loss of history, plus a re-parse, and every page key changes.
3. **Copy the document by grafting every page into a new one, then save the copy.** Loses document-level data: bookmarks, form definitions, page labels, embedded files, metadata.
4. **Replay.** Keep the original bytes and the list of commands. To save, open the original again, replay the commands up to the current undo position, and save that copy. The live document is never saved.

## Decision

Option 4.

- `MupdfEngine` keeps `original` (the bytes as opened) and `history: Command[]`, kept aligned with the journal. A new command truncates `history` at the current position, exactly as the journal discards its redo steps.
- `save()` opens a fresh copy, unlocks it with the session password if needed, replays `history[0 … position)`, checks the page count matches the live document, and saves the copy.
- `applyCommand(doc, command)` is a plain function used both for live edits and for replay, so the two can't drift apart.

## Consequences

- ✅ Undo and redo work across any number of saves (covered by the test "can undo past a save point").
- ✅ **Incremental save is now correct by construction:** it always appends to the _original_ file, so digital signatures in the original stay valid.
- ✅ Saving can never corrupt the live document or its history.
- ➖ Saving costs a re-parse plus a replay. For page operations that's milliseconds. Future annotation commands replay just as cheaply; we'll measure on large files.
- ➖ Commands must be deterministic and self-contained. For example, `insertDocument` carries the inserted file's bytes. That costs memory, but a few MB is fine on a desktop.
- ➖ The open file's password stays in worker memory for the session. It's never written anywhere.
- 🔁 Revisit if MuPDF fixes journalling across saves. The test above will tell us.
