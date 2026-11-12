# 0007 — Annotations, forms, redaction and flattening

- **Status:** accepted
- **Date:** 2026-11-12
- **Version:** 1.0.14-pre-alpha
- **Code:** `src/engine/mupdf/annotations.ts`, `src/state/annotations.ts`, `src/features/annotate/`, `src/features/forms/`

## Context

"Fully editable" means adding marks to a PDF (highlights, drawings, shapes, text boxes, notes, images, signatures), changing and removing them later, filling in forms, hiding or removing content, and producing a final version that can't be changed. All of it has to keep undo, redo and save-by-replay ([0004](0004-save-by-replay.md)) working.

## Decisions

### Everything you add is a real PDF annotation

Highlight, underline and strikethrough use text markup with QuadPoints taken from the text selection. Drawings are ink; rectangles and ellipses are Square and Circle; lines and arrows are Line; sticky notes are Text; text boxes are FreeText; images are Stamp with `setStampImage`. A drawn signature is ink; a typed or uploaded one is an image stamp.

Because they're standard annotations, they stay movable and editable here **and** in Acrobat, Edge and Chrome. The engine draws their real appearance into the page bitmap. The UI overlay only draws temporary things: previews while dragging, selection handles and editors.

### Identity: `/NM`, not object numbers

Moving or deleting an annotation needs an identity that's the same in the live document and in the fresh copy that save-by-replay builds. Object numbers aren't reliable for that, because undone operations can make the two copies allocate differently. So:

- new annotations get an id from the UI (`ps-<uuid>`), stored as `/NM`;
- existing ones without `/NM` get a deterministic name (`ps-<page>-<index>`) when the file is opened, before the journal starts, and the save copy does exactly the same;
- inserted documents' annotations are named the same way right after grafting.

Ids only need to be unique per page, because every command addresses `(page, id)`.

### Move and resize

Rect-based annotations take a new rect. Ink and lines have their points mapped from the old bounds to the new ones, so resizing a drawing scales it. Text markup can't be moved: it belongs to its text, and dragging it off would be meaningless. The UI says so instead of trying.

### Cover vs redact: honest names

- **Cover** (whiteout) is a white rectangle annotation. It _hides_; the text underneath is still in the file. A test asserts this, so nobody mistakes it for redaction. The tool's tooltip says "hides, does not remove".
- **Redact** marks areas first (red outlines). **Apply redactions** then removes text, image pixels and covered vector art under every mark, drawing black boxes, after a confirmation that explains it's permanent once saved. A test asserts the text is gone from the saved file. Undo still works until you save.

### Flatten

`doc.bake()` merges every annotation and form field into page content, for sending a final copy. It asks first and can be undone.

### Forms

Widgets are listed with kind, value, options and flags, and are filled through `setTextValue`, `toggle` and `setChoiceValue`. The UI puts see-through native controls over each field. The engine-drawn appearance shows the value, and the control becomes opaque while focused. Read-only fields are disabled, and the engine refuses them too. Widgets are identified by object number: they're never created by us, so the live document and save copy agree.

### Signatures are remembered locally

The last signature (ink strokes or a typed/uploaded image) can be kept in the webview's `localStorage`, which never leaves the computer, so it can be reused. That's opt-in per signature ("Remember on this computer"), and the app works if storage is unavailable.

### Text edits can be restyled

`replaceText` takes an optional `style` (size, colour, bold, italic, family). A restyled line can't use the original font, so the chain starts at the standard font ([0006](0006-font-chain-for-text-edits.md)). The baseline stays where it was.

## Consequences

- ✅ Every edit is undoable, labelled ("Undo add arrow", "Undo resize"), and survives save and reopen with the same ids (tested).
- ✅ Annotations work in other PDF viewers; flattening makes them permanent when needed.
- ➖ Text boxes use the PDF standard fonts (Helvetica, Times, Courier), so no ₹ in text boxes yet. FreeText's default appearance can't embed other fonts. Fix: generate the appearance ourselves.
- ➖ Signature and button fields can't be filled yet; digital signatures are out of scope.
- ➖ Annotations are listed per page on demand; pages with thousands of annotations haven't been measured.
