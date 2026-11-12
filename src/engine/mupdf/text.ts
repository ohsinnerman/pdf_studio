import * as mupdf from 'mupdf';
import { EngineError, type FontFamily, type FontStyle, type TextLine } from '../api.ts';

/**
 * Editing existing text (docs/ARCHITECTURE.md §12).
 *
 * A PDF has no paragraphs, only glyphs at coordinates, so "editing a line" is:
 *   1. find the line's glyphs and their style (StructuredText),
 *   2. remove exactly those glyphs (a redaction that removes text only, never
 *      images or vector art),
 *   3. draw the new string at the same baseline, size and colour, in a font
 *      that has every glyph it needs.
 *
 * Fonts: the original is usually an embedded subset that lacks new letters, so
 * we substitute the closest standard family (sans/serif/mono × bold/italic),
 * embedded in full as a CID font so any character it has is usable, and the
 * text stays selectable and searchable (MuPDF writes a ToUnicode map).
 */

// ---------- Reading lines ----------

/** Text is editable only if it runs left-to-right along the page (most text). */
const isHorizontal = ([dx, dy]: mupdf.Point) => dx > 0.99 && Math.abs(dy) < 0.01;

export function classifyFont(font: mupdf.Font): FontStyle {
  const name = font.getName();
  // Subset fonts are named "ABCDEF+RealName"; the flags are often missing, so read the name too.
  const clean = name.replace(/^[A-Z]{6}\+/, '');
  const lower = clean.toLowerCase();
  let family: FontFamily = 'sans';
  if (font.isMono() || /mono|courier|consol|code/.test(lower)) family = 'mono';
  else if (font.isSerif() || /times|serif(?!.*sans)|georgia|garamond|roman|cambria|book|minion/.test(lower)) {
    family = 'serif';
  }
  if (/sans/.test(lower)) family = family === 'mono' ? 'mono' : 'sans';
  return {
    name: clean,
    family,
    bold: font.isBold() || /bold|black|heavy|semibold|demi/.test(lower),
    italic: font.isItalic() || /italic|oblique/.test(lower),
  };
}

export function readTextLines(page: mupdf.PDFPage): TextLine[] {
  const stext = page.toStructuredText('preserve-whitespace');
  const lines: TextLine[] = [];
  let current: {
    chars: string[];
    bbox: mupdf.Rect;
    dir: mupdf.Point;
    origin?: mupdf.Point;
    size?: number;
    color?: mupdf.Color;
    font?: FontStyle;
    x1: number;
    top: number;
    bottom: number;
  } | null = null;

  try {
    stext.walk({
      beginLine(bbox, _wmode, direction) {
        current = { chars: [], bbox, dir: direction, x1: -Infinity, top: Infinity, bottom: -Infinity };
      },
      onChar(c, origin, font, size, quad, color) {
        if (!current) return;
        current.chars.push(c);
        if (!current.origin) {
          current.origin = origin;
          current.size = size;
          current.color = color;
          current.font = classifyFont(font);
        }
        // quad = [ulx, uly, urx, ury, llx, lly, lrx, lry]
        current.x1 = Math.max(current.x1, quad[2], quad[6]);
        current.top = Math.min(current.top, quad[1], quad[3]);
        current.bottom = Math.max(current.bottom, quad[5], quad[7]);
      },
      endLine() {
        const line = current;
        current = null;
        if (!line || !line.origin || !line.font || line.size === undefined) return;
        const text = line.chars.join('');
        if (text.trim() === '') return;
        lines.push({
          text: text.replace(/\s+$/, ''),
          bbox: [...line.bbox] as TextLine['bbox'],
          origin: [line.origin[0], line.origin[1]],
          size: line.size,
          color: toRgb(line.color),
          font: line.font,
          editable: isHorizontal(line.dir),
        });
      },
    });
  } finally {
    stext.destroy();
  }
  // Content order isn't visual order (an edited line is drawn last), so sort top-to-bottom,
  // then left-to-right for lines sharing a baseline.
  return lines.sort((a, b) => {
    const dy = a.origin[1] - b.origin[1];
    return Math.abs(dy) > Math.min(a.size, b.size) * 0.3 ? dy : a.origin[0] - b.origin[0];
  });
}

function toRgb(color: mupdf.Color | undefined): [number, number, number] {
  if (!color) return [0, 0, 0];
  if (color.length === 1) return [color[0], color[0], color[0]];
  if (color.length === 3) return [color[0], color[1], color[2]];
  // CMYK -> RGB (naive, good enough for text colour)
  const [c, m, y, k] = color;
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

// ---------- Substitute fonts ----------

/** MuPDF ships the 14 standard PDF fonts (as metric-compatible Nimbus/URW clones). */
export function substituteFontName({
  family,
  bold,
  italic,
}: Pick<FontStyle, 'family' | 'bold' | 'italic'>): string {
  if (family === 'serif') {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold) return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }
  const base = family === 'mono' ? 'Courier' : 'Helvetica';
  const oblique = family === 'mono' || family === 'sans' ? 'Oblique' : 'Italic';
  if (bold && italic) return `${base}-Bold${oblique}`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-${oblique}`;
  return base;
}

/** Characters the font can't draw (gid 0 = .notdef). Whitespace always counts as drawable. */
export function missingCharacters(font: mupdf.Font, text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (font.encodeCharacter(ch.codePointAt(0)!) === 0) missing.add(ch);
  }
  return [...missing];
}

// ---------- Replacing a line ----------

export interface ReplaceTextInput {
  readonly line: Pick<TextLine, 'bbox' | 'origin' | 'size' | 'color'> & {
    readonly font: Pick<FontStyle, 'family' | 'bold' | 'italic'>;
  };
  readonly text: string;
}

/**
 * The redaction box for a line: its glyphs' extent, pulled in vertically so the
 * descenders/ascenders of neighbouring lines (which overlap with tight leading)
 * are never caught. MuPDF removes a glyph when its box overlaps the area.
 */
export function redactionArea(
  line: Pick<TextLine, 'bbox' | 'origin' | 'size'>,
): [number, number, number, number] {
  const [x0, , x1] = line.bbox;
  const baseline = line.origin[1];
  // Glyphs of this line sit roughly between baseline - 0.7em (cap height) and baseline + 0.2em.
  return [x0 - 0.5, baseline - line.size * 0.55, x1 + 0.5, baseline + line.size * 0.05];
}

const fmt = (n: number) => (Math.abs(n) < 1e-6 ? '0' : Number(n.toFixed(4)).toString());

export function replaceText(doc: mupdf.PDFDocument, pageIndex: number, input: ReplaceTextInput): void {
  const fontName = substituteFontName(input.line.font);
  const font = new mupdf.Font(fontName);
  const missing = missingCharacters(font, input.text);
  if (missing.length > 0) {
    throw new EngineError(
      'invalid-command',
      `The substitute font (${fontName}) can't show ${missing.map((c) => `"${c}"`).join(', ')}`,
    );
  }

  const page = doc.loadPage(pageIndex);
  try {
    // 1. Remove the old glyphs, and only glyphs: images and vector art stay.
    const redact = page.createAnnotation('Redact');
    redact.setRect(redactionArea(input.line));
    page.applyRedactions(
      false,
      mupdf.PDFPage.REDACT_IMAGE_NONE,
      mupdf.PDFPage.REDACT_LINE_ART_NONE,
      mupdf.PDFPage.REDACT_TEXT_REMOVE,
    );

    // 2. Draw the new text (an empty string just deletes the line).
    if (input.text.trim() !== '') drawText(doc, page, font, input);
  } finally {
    page.destroy();
  }
}

function drawText(
  doc: mupdf.PDFDocument,
  page: mupdf.PDFPage,
  font: mupdf.Font,
  { line, text }: ReplaceTextInput,
) {
  const pageObj = page.getObject();

  // Font resource. /Resources may be inherited from the page tree; adding a font there is harmless.
  let resources = pageObj.getInheritable('Resources');
  if (resources.isNull()) {
    pageObj.put('Resources', doc.newDictionary());
    resources = pageObj.get('Resources');
  }
  if (resources.get('Font').isNull()) resources.put('Font', doc.newDictionary());
  const fonts = resources.get('Font');
  let n = 1;
  while (!fonts.get(`PSF${n}`).isNull()) n++;
  const resName = `PSF${n}`;
  fonts.put(resName, doc.addFont(font));

  // Glyph ids for an Identity-H CID font, as a hex string.
  let hex = '';
  for (const ch of text) {
    hex += font.encodeCharacter(ch.codePointAt(0)!).toString(16).padStart(4, '0');
  }

  // Page space (top-left, y down, rotation applied) -> PDF user space (bottom-left, y up).
  const toUser = mupdf.Matrix.invert(page.getTransform());
  const [ox, oy] = applyPoint(toUser, line.origin);
  // Baseline direction: page space is left-to-right for editable lines; map it into user space.
  let [ux, uy] = applyVector(toUser, [1, 0]);
  const len = Math.hypot(ux, uy);
  ux /= len;
  uy /= len;
  // Text "up" in user space is the baseline rotated 90° counter-clockwise.
  const tm = [ux, uy, -uy, ux, ox, oy].map(fmt).join(' ');
  const [r, g, b] = line.color.map(fmt);

  // q/Q around the old content, so whatever graphics state it leaves can't skew our text.
  const content = `Q q BT /${resName} ${fmt(line.size)} Tf ${r} ${g} ${b} rg ${tm} Tm <${hex}> Tj ET Q`;
  const before = doc.addStream('q', {});
  const after = doc.addStream(content, {});
  const old = pageObj.get('Contents');
  const contents = doc.newArray();
  contents.push(before);
  if (old.isArray()) old.forEach((item) => contents.push(item));
  else if (!old.isNull()) contents.push(old);
  contents.push(after);
  pageObj.put('Contents', contents);
}

function applyPoint(m: mupdf.Matrix, [x, y]: readonly [number, number]): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

function applyVector(m: mupdf.Matrix, [x, y]: readonly [number, number]): [number, number] {
  return [x * m[0] + y * m[2], x * m[1] + y * m[3]];
}
