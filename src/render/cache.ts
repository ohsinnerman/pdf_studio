/**
 * LRU cache of rendered page bitmaps with a memory budget (docs/ARCHITECTURE.md §7).
 *
 * Entries are keyed by (document, page key, page revision, scale). A page's
 * revision bumps whenever its appearance may have changed, so stale bitmaps are
 * simply never asked for again and age out.
 *
 * Generic over the bitmap type so it can be unit-tested without a browser.
 */

export interface Bitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface BitmapKey {
  readonly docId: string;
  readonly pageKey: number;
  readonly revision: number;
  /** Device pixels per point, rounded (see roundScale). */
  readonly scale: number;
}

/** Rounds render scales so tiny zoom differences reuse the same bitmap. */
export const roundScale = (scale: number) => Math.round(scale * 100) / 100;

const pageId = (k: Omit<BitmapKey, 'scale'>) => `${k.docId}|${k.pageKey}|${k.revision}`;
const fullId = (k: BitmapKey) => `${pageId(k)}|${k.scale}`;
const bytesOf = (b: Bitmap) => b.width * b.height * 4;

interface Entry<B extends Bitmap> {
  readonly key: BitmapKey;
  readonly bitmap: B;
}

export class BitmapCache<B extends Bitmap> {
  // Map iteration order is insertion order: the first entry is the least recently used.
  private readonly entries = new Map<string, Entry<B>>();
  private used = 0;

  constructor(private readonly budgetBytes: number) {}

  get bytesUsed(): number {
    return this.used;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: BitmapKey): B | undefined {
    const id = fullId(key);
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    this.touch(id, entry);
    return entry.bitmap;
  }

  /**
   * The sharpest cached bitmap for this exact page revision at any scale. Shown,
   * stretched, while the sharp one renders, so a page never flashes blank.
   */
  getBest(key: Omit<BitmapKey, 'scale'>): { bitmap: B; scale: number } | undefined {
    const prefix = `${pageId(key)}|`;
    let best: Entry<B> | undefined;
    for (const [id, entry] of this.entries) {
      if (id.startsWith(prefix) && (!best || entry.key.scale > best.key.scale)) best = entry;
    }
    return best && { bitmap: best.bitmap, scale: best.key.scale };
  }

  set(key: BitmapKey, bitmap: B): void {
    const id = fullId(key);
    const existing = this.entries.get(id);
    if (existing) this.remove(id, existing);
    this.entries.set(id, { key, bitmap });
    this.used += bytesOf(bitmap);
    this.evict(id);
  }

  /** Drops every bitmap of a document (on close). */
  clearDocument(docId: string): void {
    for (const [id, entry] of this.entries) if (entry.key.docId === docId) this.remove(id, entry);
  }

  clear(): void {
    for (const [id, entry] of this.entries) this.remove(id, entry);
  }

  private touch(id: string, entry: Entry<B>) {
    this.entries.delete(id);
    this.entries.set(id, entry);
  }

  private remove(id: string, entry: Entry<B>) {
    this.entries.delete(id);
    this.used -= bytesOf(entry.bitmap);
    // GPU memory behind an ImageBitmap is freed promptly only when closed explicitly.
    entry.bitmap.close();
  }

  private evict(keep: string) {
    for (const [id, entry] of this.entries) {
      if (this.used <= this.budgetBytes) return;
      if (id !== keep) this.remove(id, entry);
    }
  }
}
