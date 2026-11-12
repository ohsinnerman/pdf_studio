import * as mupdf from 'mupdf';
import {
  EngineError,
  type AnnotationChanges,
  type AnnotationInfo,
  type AnnotationKind,
  type FieldInfo,
  type NewAnnotation,
  type Point,
  type Quad,
  type Rect,
  type RGB,
} from '../api.ts';

/**
 * Annotations and form fields (docs/ARCHITECTURE.md §6, ADR 0007).
 *
 * Everything the user adds is a real PDF annotation, so it stays movable and
 * editable here AND in Acrobat, Edge or Chrome. Each one is identified by its
 * /NM (unique name): new ones get an id from the UI, and existing ones without a
 * name are named deterministically when the file is opened (normaliseNames).
 * That identity is the same in the live document and in the fresh copy that
 * save-by-replay builds (ADR 0004); object numbers would not be.
 */

/** Marks annotations PDF Studio created, and which tool made them. */
const SUBJECT = 'PDF Studio';

// ---------- Identity ----------

/**
 * Gives every annotation without a /NM a stable name derived from its page and
 * position. Deterministic, so the live document and the save copy agree.
 * Widgets (form fields) are left alone; they're identified by field name.
 */
export function normaliseNames(doc: mupdf.PDFDocument, pageIndices?: readonly number[]): void {
  const n = doc.countPages();
  for (const i of pageIndices ?? Array.from({ length: n }, (_, k) => k)) {
    const annots = doc.findPage(i).get('Annots');
    if (!annots.isArray()) continue;
    for (let k = 0; k < annots.length; k++) {
      const a = annots.get(k).resolve();
      if (!a.isDictionary() || (a.get('Subtype').isName() && a.get('Subtype').asName() === 'Widget'))
        continue;
      if (a.get('NM').isNull()) a.put('NM', doc.newString(`ps-${i}-${k}`));
    }
  }
}

function findAnnot(page: mupdf.PDFPage, id: string): mupdf.PDFAnnotation {
  const annot = page.getAnnotations().find((a) => a.getName() === id);
  if (!annot) throw new EngineError('invalid-command', `Annotation ${id} not found`);
  return annot;
}

// ---------- Reading ----------

const rgb = (c: mupdf.AnnotColor): RGB | null => {
  if (c.length === 0) return null;
  if (c.length === 1) return [c[0], c[0], c[0]];
  if (c.length === 3) return [c[0], c[1], c[2]];
  const [cy, m, y, k] = c;
  return [(1 - cy) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
};

function kindOf(annot: mupdf.PDFAnnotation): AnnotationKind {
  const subject = annot.getSubject();
  switch (annot.getType()) {
    case 'Highlight':
      return 'highlight';
    case 'Underline':
      return 'underline';
    case 'StrikeOut':
      return 'strikeout';
    case 'Ink':
      return subject === `${SUBJECT}: signature` ? 'signature' : 'ink';
    case 'Square':
      return subject === `${SUBJECT}: whiteout` ? 'whiteout' : 'rectangle';
    case 'Circle':
      return 'ellipse';
    case 'Line': {
      const { end } = annot.getLineEndingStyles();
      return end === 'None' ? 'line' : 'arrow';
    }
    case 'Text':
      return 'note';
    case 'FreeText':
      return 'textbox';
    case 'Stamp':
      return subject === `${SUBJECT}: signature` ? 'signature' : 'image';
    case 'Redact':
      return 'redaction';
    default:
      return 'other';
  }
}

const FONT_BY_DA: Record<string, 'sans' | 'serif' | 'mono'> = { Helv: 'sans', TiRo: 'serif', Cour: 'mono' };

export function listAnnotations(page: mupdf.PDFPage): AnnotationInfo[] {
  return page.getAnnotations().flatMap((annot): AnnotationInfo[] => {
    const type = annot.getType();
    if (type === 'Popup' || type === 'Link' || type === 'Widget') return [];
    const kind = kindOf(annot);
    const info: AnnotationInfo = {
      id: annot.getName(),
      kind,
      rect: annot.getBounds() as Rect,
      color: rgb(annot.getColor()),
      fill: annot.hasInteriorColor() ? rgb(annot.getInteriorColor()) : null,
      width: annot.hasBorder() ? annot.getBorderWidth() : 0,
      opacity: annot.getOpacity(),
      contents: annot.getContents(),
      fontSize: null,
      font: null,
      movable: !['highlight', 'underline', 'strikeout', 'other'].includes(kind),
      resizable: [
        'rectangle',
        'ellipse',
        'textbox',
        'image',
        'signature',
        'whiteout',
        'redaction',
        'ink',
      ].includes(kind),
    };
    if (kind === 'textbox') {
      const da = annot.getDefaultAppearance();
      return [
        {
          ...info,
          fontSize: da.size,
          font: FONT_BY_DA[da.font] ?? 'sans',
          color: rgb(da.color) ?? info.color,
        },
      ];
    }
    return [info];
  });
}

/** Quads covering the text between two points, like dragging a text selection. */
export function selectionQuads(page: mupdf.PDFPage, a: Point, b: Point): Quad[] {
  const stext = page.toStructuredText('preserve-whitespace');
  try {
    return stext.highlight([...a] as mupdf.Point, [...b] as mupdf.Point) as Quad[];
  } finally {
    stext.destroy();
  }
}

// ---------- Creating ----------

const DA_FONT = { sans: 'Helv', serif: 'TiRo', mono: 'Cour' } as const;

export function addAnnotation(page: mupdf.PDFPage, id: string, spec: NewAnnotation): void {
  if (page.getAnnotations().some((a) => a.getName() === id)) {
    throw new EngineError('invalid-command', `Annotation ${id} already exists`);
  }
  const create = (type: mupdf.PDFAnnotationType, tool: string) => {
    const annot = page.createAnnotation(type);
    annot.setName(id);
    annot.setSubject(`${SUBJECT}: ${tool}`);
    annot.setModificationDate(new Date(0)); // deterministic for save-by-replay
    return annot;
  };

  switch (spec.kind) {
    case 'highlight':
    case 'underline':
    case 'strikeout': {
      if (spec.quads.length === 0) throw new EngineError('invalid-command', 'Select some text first');
      const type =
        spec.kind === 'highlight' ? 'Highlight' : spec.kind === 'underline' ? 'Underline' : 'StrikeOut';
      const annot = create(type, spec.kind);
      annot.setColor([...spec.color]);
      annot.setQuadPoints(spec.quads.map((q) => [...q] as mupdf.Quad));
      if (spec.kind === 'highlight') annot.setOpacity(spec.opacity ?? 1);
      annot.update();
      return;
    }
    case 'ink':
    case 'signature-ink': {
      const strokes = spec.strokes.filter((s) => s.length > 0);
      if (strokes.length === 0) throw new EngineError('invalid-command', 'Nothing was drawn');
      const annot = create('Ink', spec.kind === 'ink' ? 'ink' : 'signature');
      annot.setColor([...spec.color]);
      annot.setBorderWidth(spec.width);
      annot.setInkList(strokes.map((s) => s.map((p) => [...p] as mupdf.Point)));
      if (spec.opacity !== undefined) annot.setOpacity(spec.opacity);
      annot.update();
      return;
    }
    case 'whiteout': {
      // Covers content, it doesn't remove it: honest naming in the UI ("Cover"), see Redact for removal.
      const annot = create('Square', 'whiteout');
      annot.setRect(normaliseRect(spec.rect));
      annot.setColor([]);
      annot.setInteriorColor([1, 1, 1]);
      annot.setBorderWidth(0);
      annot.update();
      return;
    }
    case 'rectangle':
    case 'ellipse': {
      const annot = create(spec.kind === 'ellipse' ? 'Circle' : 'Square', spec.kind);
      annot.setRect(normaliseRect(spec.rect));
      annot.setColor([...spec.color]);
      annot.setInteriorColor(spec.fill ? [...spec.fill] : []);
      annot.setBorderWidth(spec.width);
      annot.update();
      return;
    }
    case 'line':
    case 'arrow': {
      const annot = create('Line', spec.kind);
      annot.setLine([...spec.a] as mupdf.Point, [...spec.b] as mupdf.Point);
      annot.setColor([...spec.color]);
      annot.setBorderWidth(spec.width);
      annot.setLineEndingStyles('None', spec.kind === 'arrow' ? 'OpenArrow' : 'None');
      annot.update();
      return;
    }
    case 'note': {
      const annot = create('Text', 'note');
      const [x, y] = spec.at;
      annot.setRect([x, y, x + 20, y + 20]);
      annot.setIcon('Comment');
      annot.setColor([...spec.color]);
      annot.setContents(spec.contents);
      annot.update();
      return;
    }
    case 'textbox': {
      const annot = create('FreeText', 'textbox');
      annot.setRect(normaliseRect(spec.rect));
      annot.setDefaultAppearance(DA_FONT[spec.font], spec.fontSize, [...spec.color]);
      annot.setContents(spec.contents);
      annot.setBorderWidth(0);
      annot.update();
      return;
    }
    case 'image':
    case 'signature-image': {
      let image: mupdf.Image;
      try {
        image = new mupdf.Image(spec.bytes);
      } catch {
        throw new EngineError('invalid-command', 'That image could not be read. Use a PNG or JPEG.');
      }
      const annot = create('Stamp', spec.kind === 'image' ? 'image' : 'signature');
      annot.setRect(normaliseRect(spec.rect));
      annot.setStampImage(image);
      annot.update();
      return;
    }
    case 'redaction': {
      const annot = create('Redact', 'redaction');
      annot.setRect(normaliseRect(spec.rect));
      annot.update();
      return;
    }
  }
}

function normaliseRect([x0, y0, x1, y1]: Rect): mupdf.Rect {
  const r: mupdf.Rect = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  if (r[2] - r[0] < 1 || r[3] - r[1] < 1) throw new EngineError('invalid-command', 'That area is too small');
  return r;
}

// ---------- Changing ----------

/** Maps a point from one rect to another (for moving and resizing vector annotations). */
function mapPoint([x, y]: mupdf.Point, from: mupdf.Rect, to: mupdf.Rect): mupdf.Point {
  const sx = (to[2] - to[0]) / Math.max(1e-6, from[2] - from[0]);
  const sy = (to[3] - to[1]) / Math.max(1e-6, from[3] - from[1]);
  return [to[0] + (x - from[0]) * sx, to[1] + (y - from[1]) * sy];
}

/** Moves or resizes an annotation so its bounds become `target`. */
function placeAnnotation(annot: mupdf.PDFAnnotation, target: Rect) {
  const to = normaliseRect(target);
  const type = annot.getType();
  if (type === 'Ink') {
    const from = annot.getBounds();
    annot.setInkList(annot.getInkList().map((stroke) => stroke.map((p) => mapPoint(p, from, to))));
  } else if (type === 'Line') {
    const from = annot.getBounds();
    const [a, b] = annot.getLine();
    annot.setLine(mapPoint(a!, from, to), mapPoint(b!, from, to));
  } else if (annot.hasRect()) {
    annot.setRect(to);
  } else {
    throw new EngineError('invalid-command', "This annotation can't be moved");
  }
}

export function updateAnnotation(page: mupdf.PDFPage, id: string, changes: AnnotationChanges): void {
  const annot = findAnnot(page, id);
  const kind = kindOf(annot);
  if (changes.rect) placeAnnotation(annot, changes.rect);
  if (changes.contents !== undefined) annot.setContents(changes.contents);
  if (changes.width !== undefined && annot.hasBorder()) annot.setBorderWidth(changes.width);
  if (changes.opacity !== undefined) annot.setOpacity(changes.opacity);
  if (changes.fill !== undefined && annot.hasInteriorColor()) {
    annot.setInteriorColor(changes.fill ? [...changes.fill] : []);
  }
  if (kind === 'textbox' && (changes.color || changes.fontSize || changes.font)) {
    const da = annot.getDefaultAppearance();
    annot.setDefaultAppearance(
      changes.font ? DA_FONT[changes.font] : da.font,
      changes.fontSize ?? da.size,
      changes.color ? [...changes.color] : da.color,
    );
  } else if (changes.color) {
    annot.setColor([...changes.color]);
  }
  annot.setModificationDate(new Date(0));
  annot.update();
}

export function moveAnnotation(page: mupdf.PDFPage, id: string, dx: number, dy: number): void {
  const annot = findAnnot(page, id);
  const kind = kindOf(annot);
  if (['highlight', 'underline', 'strikeout'].includes(kind)) {
    throw new EngineError(
      'invalid-command',
      'Text markup stays on its text; delete it and mark the new text instead',
    );
  }
  const [x0, y0, x1, y1] =
    annot.getType() === 'Ink' || annot.getType() === 'Line' ? annot.getBounds() : annot.getRect();
  placeAnnotation(annot, [x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
  annot.update();
}

export function deleteAnnotation(page: mupdf.PDFPage, id: string): void {
  page.deleteAnnotation(findAnnot(page, id));
}

/**
 * Applies every pending redaction in the document: the text, image pixels and
 * vector art under each box are REMOVED from the file, and a black box is drawn.
 * Irreversible once saved (until then, Undo restores everything).
 */
export function applyAllRedactions(doc: mupdf.PDFDocument): number[] {
  const changed: number[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    try {
      if (!page.getAnnotations().some((a) => a.getType() === 'Redact')) continue;
      page.applyRedactions(
        true,
        mupdf.PDFPage.REDACT_IMAGE_PIXELS,
        mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
        mupdf.PDFPage.REDACT_TEXT_REMOVE,
      );
      changed.push(page.getObject().asIndirect());
    } finally {
      page.destroy();
    }
  }
  if (changed.length === 0) throw new EngineError('invalid-command', 'There are no redactions to apply');
  return changed;
}

// ---------- Form fields ----------

const widgetId = (w: mupdf.PDFWidget) => `w${w.getObject().asIndirect()}`;

function fieldKind(w: mupdf.PDFWidget): FieldInfo['kind'] {
  if (w.isCheckbox()) return 'checkbox';
  if (w.isRadioButton()) return 'radio';
  if (w.isText()) return 'text';
  if (w.isChoice()) return 'choice';
  if (w.isPushButton()) return 'button';
  return w.getFieldType() === 'signature' ? 'signature' : 'button';
}

export function listFields(page: mupdf.PDFPage): FieldInfo[] {
  return page.getWidgets().map((w) => {
    const kind = fieldKind(w);
    return {
      id: widgetId(w),
      kind,
      name: w.getName(),
      label: w.getLabel(),
      value: w.getValue(),
      checked:
        kind === 'checkbox' || kind === 'radio' ? w.getValue() !== 'Off' && w.getValue() !== '' : false,
      rect: w.getBounds() as Rect,
      options: kind === 'choice' ? w.getOptions() : [],
      readOnly: w.isReadOnly(),
      multiline: kind === 'text' && w.isMultiline(),
      maxLength: kind === 'text' ? w.getMaxLen() : 0,
    };
  });
}

export function setFieldValue(page: mupdf.PDFPage, id: string, value: string | boolean): void {
  const widget = page.getWidgets().find((w) => widgetId(w) === id);
  if (!widget) throw new EngineError('invalid-command', `Field ${id} not found`);
  if (widget.isReadOnly()) throw new EngineError('invalid-command', 'This field is read-only');
  const kind = fieldKind(widget);
  if (kind === 'checkbox' || kind === 'radio') {
    const on = widget.getValue() !== 'Off' && widget.getValue() !== '';
    if (on !== Boolean(value)) widget.toggle();
  } else if (kind === 'text') {
    widget.setTextValue(String(value));
  } else if (kind === 'choice') {
    widget.setChoiceValue(String(value));
  } else {
    throw new EngineError('invalid-command', "This field can't be filled in here");
  }
  widget.update();
}
