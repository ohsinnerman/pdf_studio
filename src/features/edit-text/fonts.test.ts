import { describe, expect, it } from 'vitest';
import { cssFont, rgbCss, substituteLabel } from './fonts.ts';

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
