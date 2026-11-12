import { describe, expect, it } from 'vitest';
import { cssFont, planFonts, rgbCss, substituteLabel } from './fonts.ts';

describe('edit-text fonts', () => {
  it('names the substitute font the edited line will use', () => {
    expect(substituteLabel({ family: 'serif', bold: true, italic: false })).toBe('Times Bold');
    expect(substituteLabel({ family: 'sans', bold: false, italic: true })).toBe('Helvetica Italic');
    expect(substituteLabel({ family: 'mono', bold: false, italic: false })).toBe('Courier');
  });
  it('builds a CSS font that matches the substitute metrics', () => {
    expect(cssFont({ family: 'serif', bold: true, italic: true }, 16)).toMatch(
      /^italic 700 16px 'Times New Roman'/,
    );
    expect(cssFont({ family: 'sans', bold: false, italic: false }, 12)).toMatch(/^400 12px Arial/);
  });
  it('converts colours', () => {
    expect(rgbCss([1, 0.5, 0])).toBe('rgb(255 128 0)');
  });
});

describe('planFonts', () => {
  const line = {
    font: { name: 'LiberationSerif', family: 'serif' as const, bold: false, italic: false },
    glyphs: ' ,.DMSaehmrs',
  };
  it('uses the original font when it has every character', () => {
    expect(planFonts(line, 'Dear Ms.').label).toBe('LiberationSerif (original font)');
  });
  it('names the characters that come from the standard font', () => {
    expect(planFonts(line, 'Mr. Quill').label).toBe('LiberationSerif, Times for “Q” “u” “i” “l”');
  });
  it('mentions the fallback font for ₹', () => {
    expect(planFonts(line, 'Ms ₹').label).toContain('Noto Sans for “₹”');
  });
  it('says closest match when the original font cannot be reused', () => {
    expect(planFonts({ ...line, glyphs: '' }, 'Hello').label).toBe('Times (closest match)');
  });
  it('warns about scripts that need shaping', () => {
    expect(planFonts(line, 'नमस्ते').problem).toMatch(/text shaping/);
  });
});
