import { useEffect } from 'react';

/**
 * Keyboard shortcuts in one place, so every action has the same shortcut from
 * the toolbar tooltip, the menu and the keyboard (docs/ARCHITECTURE.md §8).
 *
 * Keys are written like "Ctrl+Shift+Z". Ctrl also matches ⌘ on macOS.
 */
export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

export function eventToShortcut(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'key'>,
) {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key === '+') key = '='; // Ctrl+= and Ctrl++ are the same physical key
  if (key === '_') key = '-';
  parts.push(key);
  return parts.join('+');
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function useShortcuts(map: ShortcutMap): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      const handler = map[eventToShortcut(e)];
      if (!handler) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map]);
}
