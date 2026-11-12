import { describe, expect, it } from 'vitest';
import { isIdentity, keysToOrder, nextSelection, reorderForDrop } from './reorder.ts';

const keys = [10, 11, 12, 13, 14];

describe('reorderForDrop', () => {
  it('moves one page down, after the target', () => {
    expect(reorderForDrop(keys, new Set(), 10, 12)).toEqual([11, 12, 10, 13, 14]);
  });
  it('moves one page up, before the target', () => {
    expect(reorderForDrop(keys, new Set(), 14, 11)).toEqual([10, 14, 11, 12, 13]);
  });
  it('moves a selected block together, keeping its order', () => {
    expect(reorderForDrop(keys, new Set([10, 12]), 12, 14)).toEqual([11, 13, 14, 10, 12]);
  });
  it('moves only the dragged page when it is not part of the selection', () => {
    expect(reorderForDrop(keys, new Set([10, 11]), 13, 10)).toEqual([13, 10, 11, 12, 14]);
  });
  it('does nothing when dropped on itself or inside the moving block', () => {
    expect(reorderForDrop(keys, new Set(), 12, 12)).toEqual(keys);
    expect(reorderForDrop(keys, new Set([11, 12]), 11, 12)).toEqual(keys);
  });
});

describe('keysToOrder', () => {
  it('produces the engine order', () => {
    const order = keysToOrder(keys, [11, 12, 10, 13, 14]);
    expect(order).toEqual([1, 2, 0, 3, 4]);
    expect(isIdentity(order)).toBe(false);
    expect(isIdentity(keysToOrder(keys, keys))).toBe(true);
  });
});

describe('nextSelection', () => {
  const plain = { toggle: false, range: false };
  it('selects one page on a plain click', () => {
    expect(nextSelection(keys, [10, 11], 10, 13, plain)).toEqual({ selection: [13], anchor: 13 });
  });
  it('toggles with Ctrl, keeping document order', () => {
    expect(nextSelection(keys, [13], 13, 11, { toggle: true, range: false }).selection).toEqual([11, 13]);
    expect(nextSelection(keys, [11, 13], 13, 11, { toggle: true, range: false }).selection).toEqual([13]);
  });
  it('selects a range with Shift, in either direction', () => {
    expect(nextSelection(keys, [11], 11, 13, { toggle: false, range: true }).selection).toEqual([11, 12, 13]);
    expect(nextSelection(keys, [13], 13, 10, { toggle: false, range: true }).selection).toEqual([
      10, 11, 12, 13,
    ]);
  });
  it('adds a range to the selection with Ctrl+Shift', () => {
    expect(nextSelection(keys, [10], 12, 14, { toggle: true, range: true }).selection).toEqual([
      10, 12, 13, 14,
    ]);
  });
});
