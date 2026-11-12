import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampZoom, stepZoom } from './store.ts';

describe('zoom steps', () => {
  it('steps to the next preset from a preset', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
  });
  it('steps to the nearest preset from a custom fit-width zoom', () => {
    expect(stepZoom(1.18, 1)).toBe(1.25);
    expect(stepZoom(1.18, -1)).toBe(1.1);
  });
  it('stops at the limits', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
  });
});

describe('windowTitle', () => {
  it('marks unsaved changes with a bullet', async () => {
    const { windowTitle } = await import('./actions.ts');
    expect(windowTitle(null)).toBe('PDF Studio');
    expect(windowTitle({ name: 'a.pdf', info: { dirty: false } })).toBe('a.pdf — PDF Studio');
    expect(windowTitle({ name: 'a.pdf', info: { dirty: true } })).toBe('• a.pdf — PDF Studio');
  });
});
