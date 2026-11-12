# 0005 — Edit existing text by removing a line's glyphs and redrawing it

- **Status:** accepted
- **Date:** 2026-11-12
- **Version:** 1.0.10-pre-alpha
- **Detail:** [ARCHITECTURE.md §12](../ARCHITECTURE.md#12-decision-10--phase-3-ocr-and-editing-existing-text). Code: `src/engine/mupdf/text.ts`.

## Context

A PDF stores text as glyphs placed at coordinates. There are no paragraphs or text boxes to edit. Editing therefore has to remove the old glyphs and draw new ones that look the same. The hard parts are:

1. removing one line without touching its neighbours, which with tight line spacing have overlapping glyph boxes;
2. matching the font, when the embedded font is usually a _subset_ holding only the letters already on the page;
3. keeping the result selectable and searchable, not just pixels.

## Options considered

- **Cover the old text with a white box and draw new text on top.** Easy, but the old text stays in the file, where it can be copied, searched, and found by anyone who removes the box. Rejected: it looks like editing but is really hiding.
- **Rewrite the text operators in the content stream.** This would keep the original font, but only when the font has every new glyph, and parsing content streams robustly is a project of its own. Deferred.
- **Redact the line (text only), then draw the new line** in a substitute font of the same family. ✅

## Decision

- **Find lines** with MuPDF's `StructuredText`: per character we get the origin, size, colour, font and box. Lines come back in visual order. A line is editable only if it runs left-to-right in page space (rotated or vertical text is shown but not editable yet).
- **Remove** with a Redact annotation applied with `REDACT_TEXT_REMOVE` and `IMAGE_NONE`/`LINE_ART_NONE`, so only glyphs go and pictures and drawings stay. The box is the line's width but only a narrow band around its baseline (−0.55 em … +0.05 em). Glyph boxes of the lines above and below can't reach that band even at 1.15× line spacing. Tests cover tight leading, quotes and accents.
- **Draw** the new string at the original baseline, size and colour in the closest standard font (Helvetica, Times or Courier, with bold and italic). The font is embedded in full as an Identity-H CID font, so every glyph it has is usable, and MuPDF adds a ToUnicode map, so the text stays copyable. The text matrix is computed from the page transform, so rotated pages work.
- **Refuse rather than corrupt.** If the substitute font lacks a character (for example ₹ or Devanagari), the command fails with a message naming the characters, and nothing changes.
- It's an ordinary `Command` (`replaceText`), so undo, redo and save-by-replay ([0004](0004-save-by-replay.md)) work without any special code.

## Consequences

- ✅ Edits are real: the old text is gone from the file, the new text is searchable, and the result survives save and reopen (tested).
- ✅ On PDFs from Word, Chrome or LibreOffice the result is visually very close. Their usual fonts (Times New Roman, Arial, Liberation) are metric-compatible with the substitutes.
- ➖ The font face changes for edited lines when the original font is unusual (a brand font, say). The editor says which font will be used.
- ➖ One line at a time; no reflow. A longer line runs further right instead of wrapping.
- ➖ No ₹ or Indic scripts yet: the standard fonts don't have them.
- 🔁 Next steps: reuse the original font when it has every glyph needed; bundle Noto Sans/Serif (₹) and Noto Sans Devanagari as substitutes; multi-line paragraph editing.
