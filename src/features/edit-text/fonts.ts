import type { FontStyle } from '../../engine/api.ts';

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
