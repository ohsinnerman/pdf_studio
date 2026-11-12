import { describe, expect, it } from 'vitest';
import { eventToShortcut } from './shortcuts.ts';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('eventToShortcut', () => {
  it('formats modifiers in a fixed order', () => {
    expect(eventToShortcut(key('z', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    expect(eventToShortcut(key('o', { metaKey: true }))).toBe('Ctrl+O');
    expect(eventToShortcut(key('Delete'))).toBe('Delete');
  });
  it('treats Ctrl++ as Ctrl+=', () => {
    expect(eventToShortcut(key('+', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+=');
    expect(eventToShortcut(key('=', { ctrlKey: true }))).toBe('Ctrl+=');
  });
});
