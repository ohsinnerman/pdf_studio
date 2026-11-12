import type { FontStyle, TextLine } from '../../engine/api.ts';

/**
 * CSS stacks that match the engine's substitute fonts (Helvetica, Times, Courier).
 * On Windows, Arial, Times New Roman and Courier New have the same metrics, so
 * the text in the editor lines up with what will be drawn into the PDF.
 */
const STACKS: Record<FontStyle['family'], string> = {
  sans: "Arial, 'Liberation Sans', Helvetica, sans-serif",
  serif: "'Times New Roman', 'Liberation Serif', Times, serif",
  mono: "'Courier New', 'Liberation Mono', Courier, monospace",
};

const NAMES: Record<FontStyle['family'], string> = { sans: 'Helvetica', serif: 'Times', mono: 'Courier' };

export function cssFont(font: Pick<FontStyle, 'family' | 'bold' | 'italic'>, px: number): string {
  return `${font.italic ? 'italic ' : ''}${font.bold ? '700 ' : '400 '}${px}px ${STACKS[font.family]}`;
}

/** "Times Bold Italic", the name of the font the edited line will use. */
export function substituteLabel(font: Pick<FontStyle, 'family' | 'bold' | 'italic'>): string {
  return [NAMES[font.family], font.bold && 'Bold', font.italic && 'Italic'].filter(Boolean).join(' ');
}

let canvas: HTMLCanvasElement | null = null;

/** Width in CSS px of `text` in `font`, for sizing the editor as you type. */
export function measureText(text: string, font: string): number {
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export const rgbCss = ([r, g, b]: readonly [number, number, number]) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/** Characters the standard fonts (Helvetica/Times/Courier) have: Latin-1 plus common punctuation. */
const inStandard = (ch: string) => ch.codePointAt(0)! <= 0xff || '‘’“”‚„–—…•€™‹›†‡‰ŒœŠšŽžŸƒˆ˜'.includes(ch);
const NEEDS_SHAPING = /[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0EFF\u1000-\u109F]/u;
const quote = (chars: string[]) =>
  chars
    .slice(0, 4)
    .map((c) => `“${c}”`)
    .join(' ') + (chars.length > 4 ? ' …' : '');

export interface FontPlan {
  readonly label: string;
  /** Set when the edit will be refused, so the editor can warn before Enter. */
  readonly problem: string | null;
}

/**
 * Mirrors the engine's per-character font chain (ADR 0006) to tell the user, as
 * they type, which font the edit will be drawn in.
 */
export function planFonts(line: Pick<TextLine, 'font' | 'glyphs'>, text: string): FontPlan {
  const chars = [...new Set([...text].filter((c) => !/\s/.test(c)))];
  const shaped = chars.filter((c) => NEEDS_SHAPING.test(c));
  if (shaped.length > 0)
    return { label: '', problem: `${quote(shaped)} needs text shaping, which isn't supported yet` };

  const original = line.glyphs.length > 0;
  const fromStandard = chars.filter((c) => !(original && line.glyphs.includes(c)) && inStandard(c));
  const fromFallback = chars.filter((c) => !(original && line.glyphs.includes(c)) && !inStandard(c));
  const standard = substituteLabel(line.font);

  let label: string;
  if (original && fromStandard.length === 0) label = `${line.font.name} (original font)`;
  else if (original) label = `${line.font.name}, ${standard} for ${quote(fromStandard)}`;
  else label = `${standard} (closest match)`;
  if (fromFallback.length > 0) label += ` · Noto Sans for ${quote(fromFallback)}`;
  return { label, problem: null };
}
