# 0006 — A per-character font chain for text edits

- **Status:** accepted (extends [0005](0005-edit-text-by-redact-and-redraw.md))
- **Date:** 2026-11-12
- **Version:** 1.0.12-pre-alpha
- **Code:** `src/engine/mupdf/text.ts` (`planRuns`, `replaceText`), `src/features/edit-text/fonts.ts` (`planFonts`)

## Context

In 1.0.10 every edited line was redrawn in the closest standard font (Helvetica, Times or Courier). That looked fine for common fonts, but it changed the face of the whole line even for a one-letter fix, and it refused ₹, which matters for Indian invoices.

We measured what the original fonts can do. An embedded _subset_ reports, through MuPDF's `encodeCharacter`, exactly the characters it contains. The invoice fixture's body font has 32, enough for many small edits, but not, for example, every digit.

## Decision

Draw each character with the first font in this chain that has it:

1. **The line's original font**, re-embedded with `addFont` from the font program MuPDF already loaded. It's used only if its character map is _trustworthy_, meaning every character it already draws on that line maps to a real glyph. Standard-14 fonts are skipped, because they _are_ the substitutes, and MuPDF would merge the two embeddings and keep the wrong character map. That bug turned up in testing: curly quotes read back as "ª"/"º".
2. **The closest standard font**, metric-compatible with Arial, Times New Roman and Courier New, so mixing it with the original is barely visible.
3. **Bundled Noto Sans** (Regular and Bold, OFL), for characters the standard fonts lack, such as ₹.

The text is split into runs by font and drawn in one text object. Each `Tj` advances by its own font's widths, so the runs line up without manual positioning.

Safety nets:

- Scripts that need shaping (Devanagari, Arabic, Thai…) are refused with a clear message. Drawing them glyph by glyph would put matras and conjuncts in the wrong place.
- **Read-back check:** after drawing, the page's text layer must contain the typed text on that baseline. If it doesn't (a font we misjudged), the edit is refused and the whole operation rolled back. The text layer is never quietly wrong.
- **Subset on save:** fonts we add are embedded whole (Noto Sans is 630 KB), so a full save runs `subsetFonts()` when the history contains text edits. In the test, a ₹ edit grew a 29 KB invoice by about 40 KB instead of 600 KB. Incremental saves skip it, because they must not touch the original's objects.

The UI mirrors the chain in `planFonts`, using each line's reported `glyphs`. As you type, the editor says which font will be used ("LiberationSerif, Times for "Q" · Noto Sans for "₹""), and it warns before Enter when an edit will be refused.

## Consequences

- ✅ Small edits in the original font are visually identical. Larger ones mix in a metric-compatible face only where needed.
- ✅ ₹ works, in regular and bold.
- ➖ The installer grows by about 1.2 MB for the two Noto Sans files. Italic text falls back to upright Noto only for characters the standard fonts lack.
- ➖ `subsetFonts()` subsets every font in the saved copy, including original ones. That's harmless for page content, but a form field typed into later would only have the glyphs already used. Revisit when form filling lands (Phase 2).
- 🔁 Next: shaping for Indic scripts (HarfBuzz) with Noto Sans Devanagari; multi-line paragraph editing.
