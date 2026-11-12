# Architecture decision records

Short records of decisions that shaped the code: what we chose, what else we considered, and why. [ARCHITECTURE.md](../ARCHITECTURE.md) has the full reasoning; these exist so that a later change to a decision has one obvious place to be written down.

| #                                              | Decision                                                        | Status                    |
| ---------------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| [0001](0001-tauri-shell.md)                    | Tauri 2 as the desktop shell                                    | accepted                  |
| [0002](0002-mupdf-engine.md)                   | MuPDF.js as the single PDF engine                               | accepted                  |
| [0003](0003-live-document-journal.md)          | Edit a live document; undo with MuPDF's journal                 | accepted, amended by 0004 |
| [0004](0004-save-by-replay.md)                 | Save by replaying commands onto a fresh copy                    | accepted                  |
| [0005](0005-edit-text-by-redact-and-redraw.md) | Edit existing text by removing a line's glyphs and redrawing it | accepted                  |
| [0006](0006-font-chain-for-text-edits.md)      | A per-character font chain for text edits                       | accepted                  |

## Writing a new one

Copy the shape of an existing record: **Status, Date, Version · Context · Options considered · Decision · Consequences**. Number it next in sequence. Never edit a past decision's reasoning. Supersede it with a new record and update the status line of the old one.
