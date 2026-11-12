import * as mupdf from 'mupdf';
import { EngineError, type FontFamily, type FontStyle, type TextLine } from '../api.ts';

/**
 * Editing existing text (docs/ARCHITECTURE.md §12, ADRs 0005 and 0006).
 *
 * A PDF has no paragraphs, only glyphs at coordinates, so "editing a line" is:
 *   1. find the line's glyphs and their style (StructuredText),
 *   2. remove exactly those glyphs (a redaction that removes text only, never
 *      images or vector art),
 *   3. draw the new string at the same baseline, size and colour.
 *
 * Fonts, per character, first one that has the glyph (ADR 0006):
 *   a. the line's ORIGINAL font: usually an embedded subset, so it only has the
 *      letters already on the page, but using it makes small edits invisible;
 *   b. the closest STANDARD font (Helvetica/Times/Courier × bold/italic), which
 *      is metric-compatible with Arial/Times New Roman/Courier New;
 *   c. the bundled FALLBACK (Noto Sans), for characters like ₹.
 * Each font is embedded as a CID font with a ToUnicode map, so the text stays
 * selectable and searchable. Fonts we add are subset when saving.
 */

// ---------- Reading lines ----------

/** Text is editable only if it runs left-to-right along the page (most text). */
const isHorizontal = ([dx, dy]: mupdf.Point) => dx > 0.99 && Math.abs(dy) < 0.01;

/** The 14 standard PDF fonts (and MuPDF's Nimbus clones of them). They ARE the substitutes. */
const STANDARD_14 = /^(Times|Helvetica|Courier|Symbol|ZapfDingbats|Nimbus|Dingbats)(-|$|[A-Z])/;

/** Characters we report coverage for, so the UI can say which font an edit will use. */
const CANDIDATES = (() => {
  let s = '';
  for (let c = 0x20; c < 0x7f; c++) s += String.fromCharCode(c);
  for (let c = 0xa0; c <= 0xff; c++) s += String.fromCharCode(c);
  return s + '‘’“”–—…•€₹™';
})();

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

/** Which of `chars` the font can draw. */
export function coverage(font: mupdf.Font, chars: string): string {
  let out = '';
  for (const ch of chars) if (font.encodeCharacter(ch.codePointAt(0)!) > 0) out += ch;
  return out;
}

interface LineChars {
  readonly chars: string[];
  readonly fonts: mupdf.Font[];
  readonly bbox: mupdf.Rect;
  readonly dir: mupdf.Point;
  origin?: mupdf.Point;
  size?: number;
  color?: mupdf.Color;
}

/** Walks the page's text, calling `onLine` with each line's characters and fonts. */
function walkLines(page: mupdf.PDFPage, onLine: (line: LineChars) => void): void {
  const stext = page.toStructuredText('preserve-whitespace');
  let current: LineChars | null = null;
  try {
    stext.walk({
      beginLine(bbox, _wmode, direction) {
        current = { chars: [], fonts: [], bbox, dir: direction };
      },
      onChar(c, origin, font, size, _quad, color) {
        if (!current) return;
        current.chars.push(c);
        current.fonts.push(font);
        if (!current.origin) {
          current.origin = origin;
          current.size = size;
          current.color = color;
        }
      },
      endLine() {
        if (current) onLine(current);
        current = null;
      },
    });
  } finally {
    stext.destroy();
  }
}

export function readTextLines(page: mupdf.PDFPage): TextLine[] {
  const lines: TextLine[] = [];
  const glyphsByFont = new Map<string, string>();
  walkLines(page, (line) => {
    const font = line.fonts[0];
    if (!font || !line.origin || line.size === undefined) return;
    const text = line.chars.join('');
    if (text.trim() === '') return;
    const key = font.getName();
    let glyphs = glyphsByFont.get(key);
    if (glyphs === undefined) {
      const standard14 = STANDARD_14.test(key.replace(/^[A-Z]{6}\+/, ''));
      glyphs = !standard14 && trustworthyCmap(font, text) ? coverage(font, CANDIDATES) : '';
      glyphsByFont.set(key, glyphs);
    }
    lines.push({
      text: text.replace(/\s+$/, ''),
      bbox: [...line.bbox] as TextLine['bbox'],
      origin: [line.origin[0], line.origin[1]],
      size: line.size,
      color: toRgb(line.color),
      font: classifyFont(font),
      glyphs,
      editable: isHorizontal(line.dir),
    });
  });
  // Content order isn't visual order (an edited line is drawn last), so sort top-to-bottom,
  // then left-to-right for lines sharing a baseline.
  return lines.sort((a, b) => {
    const dy = a.origin[1] - b.origin[1];
    return Math.abs(dy) > Math.min(a.size, b.size) * 0.3 ? dy : a.origin[0] - b.origin[0];
  });
}

/**
 * Only reuse a font whose character map we can trust: every character it already
 * draws on this line must map to a real glyph. Symbolic fonts and odd encodings
 * fail this check, and then the standard font takes over.
 */
function trustworthyCmap(font: mupdf.Font, sample: string): boolean {
  const visible = [...sample].filter((ch) => !/\s/.test(ch));
  return visible.length > 0 && visible.every((ch) => font.encodeCharacter(ch.codePointAt(0)!) > 0);
}

function toRgb(color: mupdf.Color | undefined): [number, number, number] {
  if (!color) return [0, 0, 0];
  if (color.length === 1) return [color[0], color[0], color[0]];
  if (color.length === 3) return [color[0], color[1], color[2]];
  // CMYK -> RGB (naive, good enough for text colour)
  const [c, m, y, k] = color;
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

// ---------- Fonts ----------

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
  if (bold && italic) return `${base}-BoldOblique`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-Oblique`;
  return base;
}

/** Bytes of the bundled fallback fonts (Noto Sans). Loaded by the worker, or by tests. */
export interface FallbackFonts {
  readonly regular: Uint8Array;
  readonly bold: Uint8Array;
}

const fontCache = new Map<string, mupdf.Font>();
function cachedFont(key: string, make: () => mupdf.Font): mupdf.Font {
  let font = fontCache.get(key);
  if (!font) {
    font = make();
    fontCache.set(key, font);
  }
  return font;
}

/**
 * Scripts that need shaping (letters that join, reorder or stack). Drawing them
 * glyph by glyph would look wrong, so they're refused until shaping exists.
 */
const NEEDS_SHAPING = /[֐-ࣿऀ-෿฀-໿က-႟]/u;

export interface Run {
  readonly font: mupdf.Font;
  readonly text: string;
}

/**
 * Splits `text` into runs, each drawn with the first font in `chain` that has
 * all its glyphs. Whitespace stays in the current run when that font has it.
 * Throws an EngineError naming any character no font can draw.
 */
export function planRuns(chain: readonly mupdf.Font[], text: string): Run[] {
  const shaped = [...text].filter((ch) => NEEDS_SHAPING.test(ch));
  if (shaped.length > 0) {
    throw new EngineError(
      'invalid-command',
      `Text in this script (${[...new Set(shaped)].slice(0, 3).join(' ')}) can't be edited yet: it needs text shaping`,
    );
  }
  const runs: { font: mupdf.Font; text: string }[] = [];
  const missing = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const last = runs.at(-1);
    if (/\s/.test(ch) && last && last.font.encodeCharacter(cp) > 0) {
      last.text += ch;
      continue;
    }
    const font = chain.find((f) => f.encodeCharacter(cp) > 0);
    if (!font) {
      missing.add(ch);
      continue;
    }
    if (last?.font === font) last.text += ch;
    else runs.push({ font, text: ch });
  }
  if (missing.size > 0) {
    throw new EngineError(
      'invalid-command',
      `No available font can show ${[...missing].map((c) => `"${c}"`).join(', ')}`,
    );
  }
  return runs;
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
  return [x0 - 0.5, baseline - line.size * 0.55, x1 + 0.5, baseline + line.size * 0.05];
}

/** The original font of the line starting at `origin`, if its character map is trustworthy. */
function originalFont(page: mupdf.PDFPage, origin: readonly [number, number]): mupdf.Font | null {
  let found: mupdf.Font | null = null;
  walkLines(page, (line) => {
    if (found || !line.origin || !line.fonts[0]) return;
    if (Math.abs(line.origin[0] - origin[0]) > 0.75 || Math.abs(line.origin[1] - origin[1]) > 0.75) return;
    const font = line.fonts[0];
    // A standard-14 font IS the substitute; "reusing" it would make MuPDF merge the two
    // embeddings (same font data) and keep the wrong character map. Use the substitute.
    if (STANDARD_14.test(font.getName().replace(/^[A-Z]{6}\+/, ''))) return;
    // Only characters drawn in that same font count towards the trust check.
    const own = line.chars.filter(
      (_, i) => line.fonts[i] === font || line.fonts[i]?.getName() === font.getName(),
    );
    if (trustworthyCmap(font, own.join(''))) found = font;
  });
  return found;
}

/**
 * Whether the page's text layer now contains `text` on the baseline at `origin`.
 * "Contains", not "equals": in tables MuPDF may join our text with a neighbouring
 * cell on the same baseline into one line.
 */
function textLayerHas(
  doc: mupdf.PDFDocument,
  pageIndex: number,
  origin: readonly [number, number],
  text: string,
) {
  const page = doc.loadPage(pageIndex);
  try {
    const wanted = text.trim();
    let ok = false;
    walkLines(page, (line) => {
      if (ok || !line.origin || Math.abs(line.origin[1] - origin[1]) > 0.75) return;
      if (line.chars.join('').includes(wanted)) ok = true;
    });
    return ok;
  } finally {
    page.destroy();
  }
}

const fmt = (n: number) => (Math.abs(n) < 1e-6 ? '0' : Number(n.toFixed(4)).toString());

export function replaceText(
  doc: mupdf.PDFDocument,
  pageIndex: number,
  input: ReplaceTextInput,
  fallback: FallbackFonts | null,
): void {
  const page = doc.loadPage(pageIndex);
  try {
    // Plan the fonts BEFORE touching the page, so a refusal changes nothing.
    const chain: mupdf.Font[] = [];
    const refs = new Map<mupdf.Font, mupdf.PDFObject>();
    const original = originalFont(page, input.line.origin);
    if (original) {
      // Re-embedding can fail for unusual fonts (e.g. Type 3); then the standard font takes over.
      try {
        refs.set(original, doc.addFont(original));
        chain.push(original);
      } catch {
        /* fall through to the standard font */
      }
    }
    const standard = substituteFontName(input.line.font);
    chain.push(cachedFont(standard, () => new mupdf.Font(standard)));
    if (fallback) {
      const bold = input.line.font.bold;
      chain.push(
        cachedFont(
          bold ? 'fallback-bold' : 'fallback',
          () => new mupdf.Font(bold ? 'NotoSans-Bold' : 'NotoSans', bold ? fallback.bold : fallback.regular),
        ),
      );
    }
    const runs = input.text.trim() === '' ? [] : planRuns(chain, input.text);

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
    if (runs.length > 0) {
      drawRuns(doc, page, runs, input.line, refs);
      // 3. Read it back. If the text layer doesn't say what was typed (a font whose
      //    character map we misjudged), refuse: the caller abandons the whole operation.
      if (!textLayerHas(doc, pageIndex, input.line.origin, input.text)) {
        throw new EngineError(
          'internal',
          "The edited text wouldn't read back correctly (copy and search would break), so it wasn't applied",
        );
      }
    }
  } finally {
    page.destroy();
  }
}

function drawRuns(
  doc: mupdf.PDFDocument,
  page: mupdf.PDFPage,
  runs: readonly Run[],
  line: ReplaceTextInput['line'],
  refs: Map<mupdf.Font, mupdf.PDFObject>,
) {
  const pageObj = page.getObject();

  // Font resources. /Resources may be inherited from the page tree; adding fonts there is harmless.
  let resources = pageObj.getInheritable('Resources');
  if (resources.isNull()) {
    pageObj.put('Resources', doc.newDictionary());
    resources = pageObj.get('Resources');
  }
  if (resources.get('Font').isNull()) resources.put('Font', doc.newDictionary());
  const fonts = resources.get('Font');
  const names = new Map<mupdf.Font, string>();
  let n = 1;
  const resourceFor = (font: mupdf.Font) => {
    let name = names.get(font);
    if (!name) {
      while (!fonts.get(`PSF${n}`).isNull()) n++;
      name = `PSF${n}`;
      let ref = refs.get(font);
      if (!ref) {
        ref = doc.addFont(font);
        refs.set(font, ref);
      }
      fonts.put(name, ref);
      names.set(font, name);
    }
    return name;
  };

  // Page space (top-left, y down, rotation applied) -> PDF user space (bottom-left, y up).
  const toUser = mupdf.Matrix.invert(page.getTransform());
  const [ox, oy] = applyPoint(toUser, line.origin);
  let [ux, uy] = applyVector(toUser, [1, 0]);
  const len = Math.hypot(ux, uy);
  ux /= len;
  uy /= len;
  // Text "up" in user space is the baseline rotated 90° counter-clockwise.
  const tm = [ux, uy, -uy, ux, ox, oy].map(fmt).join(' ');
  const [r, g, b] = line.color.map(fmt);

  // One text object; each run switches font. Tj advances by the font's own widths,
  // so runs in different fonts line up without any manual positioning.
  let ops = `BT ${r} ${g} ${b} rg ${tm} Tm`;
  for (const run of runs) {
    let hex = '';
    for (const ch of run.text)
      hex += run.font.encodeCharacter(ch.codePointAt(0)!).toString(16).padStart(4, '0');
    ops += ` /${resourceFor(run.font)} ${fmt(line.size)} Tf <${hex}> Tj`;
  }
  ops += ' ET';

  // q/Q around the old content, so whatever graphics state it leaves can't skew our text.
  const before = doc.addStream('q', {});
  const after = doc.addStream(`Q q ${ops} Q`, {});
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
