/**
 * Pure helpers for page selection and drag-to-reorder, kept out of components
 * so they can be unit-tested.
 */

/**
 * New page order (as page keys) after dropping the dragged pages on `overKey`.
 * If the dragged page is part of a multi-selection, the whole selection moves
 * as a block, keeping its internal order. Dropping onto a page that is later in
 * the document places the block after it; onto an earlier page, before it.
 */
export function reorderForDrop(
  keys: readonly number[],
  selected: ReadonlySet<number>,
  activeKey: number,
  overKey: number,
): number[] {
  if (activeKey === overKey) return [...keys];
  const moving = selected.has(activeKey) ? keys.filter((k) => selected.has(k)) : [activeKey];
  const movingSet = new Set(moving);
  if (movingSet.has(overKey)) return [...keys];

  const movingDown = keys.indexOf(activeKey) < keys.indexOf(overKey);
  const rest = keys.filter((k) => !movingSet.has(k));
  const at = rest.indexOf(overKey) + (movingDown ? 1 : 0);
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Converts a key order to the engine's index order: order[i] = current index of the page now at i. */
export function keysToOrder(currentKeys: readonly number[], newKeys: readonly number[]): number[] {
  const index = new Map(currentKeys.map((k, i) => [k, i]));
  return newKeys.map((k) => {
    const i = index.get(k);
    if (i === undefined) throw new Error(`Unknown page key ${k}`);
    return i;
  });
}

export const isIdentity = (order: readonly number[]) => order.every((v, i) => v === i);

/**
 * Click selection like a file manager: plain click selects one page, Ctrl
 * toggles, Shift extends from the anchor.
 */
export function nextSelection(
  keys: readonly number[],
  current: readonly number[],
  anchor: number | null,
  clicked: number,
  mods: { readonly toggle: boolean; readonly range: boolean },
): { selection: number[]; anchor: number } {
  if (mods.range && anchor !== null && keys.includes(anchor)) {
    const [a, b] = [keys.indexOf(anchor), keys.indexOf(clicked)].sort((x, y) => x - y);
    const range = keys.slice(a, b! + 1);
    const base = mods.toggle ? current.filter((k) => !range.includes(k)) : [];
    return { selection: keys.filter((k) => base.includes(k) || range.includes(k)), anchor };
  }
  if (mods.toggle) {
    const selection = current.includes(clicked)
      ? current.filter((k) => k !== clicked)
      : keys.filter((k) => current.includes(k) || k === clicked);
    return { selection, anchor: clicked };
  }
  return { selection: [clicked], anchor: clicked };
}
