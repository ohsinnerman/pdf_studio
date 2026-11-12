import { describe, expect, it, vi } from 'vitest';
import { BitmapCache, roundScale } from './cache.ts';
import { CancelledError, RenderScheduler } from './scheduler.ts';

class FakeBitmap {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly label = '',
  ) {}
  close() {
    this.closed = true;
  }
}

const key = (pageKey: number, scale = 1, revision = 0) => ({ docId: 'd', pageKey, revision, scale });

describe('BitmapCache', () => {
  it('evicts the least recently used bitmap when over budget, and closes it', () => {
    const cache = new BitmapCache<FakeBitmap>(2 * 10 * 10 * 4);
    const a = new FakeBitmap(10, 10);
    const b = new FakeBitmap(10, 10);
    const c = new FakeBitmap(10, 10);
    cache.set(key(1), a);
    cache.set(key(2), b);
    cache.get(key(1)); // touch a, so b is now least recent
    cache.set(key(3), c);
    expect(cache.get(key(2))).toBeUndefined();
    expect(b.closed).toBe(true);
    expect(cache.get(key(1))).toBe(a);
    expect(cache.bytesUsed).toBe(800);
  });

  it('keeps a single bitmap even if it alone exceeds the budget', () => {
    const cache = new BitmapCache<FakeBitmap>(10);
    cache.set(key(1), new FakeBitmap(100, 100));
    expect(cache.size).toBe(1);
  });

  it('finds the sharpest bitmap of a page revision for a placeholder', () => {
    const cache = new BitmapCache<FakeBitmap>(1e9);
    cache.set(key(1, 0.5), new FakeBitmap(5, 5, 'small'));
    cache.set(key(1, 2), new FakeBitmap(20, 20, 'big'));
    cache.set(key(1, 3, 1), new FakeBitmap(30, 30, 'newer revision'));
    expect(cache.getBest({ docId: 'd', pageKey: 1, revision: 0 })?.bitmap.label).toBe('big');
  });

  it('clears one document', () => {
    const cache = new BitmapCache<FakeBitmap>(1e9);
    cache.set(key(1), new FakeBitmap(1, 1));
    cache.set({ ...key(1), docId: 'other' }, new FakeBitmap(1, 1));
    cache.clearDocument('d');
    expect(cache.size).toBe(1);
  });

  it('rounds scales for reuse', () => {
    expect(roundScale(1.333333)).toBe(1.33);
  });
});

function deferredRender() {
  const calls: { pageIndex: number; scale: number; resolve: (b: FakeBitmap) => void }[] = [];
  const fn = vi.fn(
    (_doc: string, pageIndex: number, scale: number) =>
      new Promise<FakeBitmap>((resolve) => calls.push({ pageIndex, scale, resolve })),
  );
  return { fn, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('RenderScheduler', () => {
  it('renders by priority, one at a time', async () => {
    const { fn, calls } = deferredRender();
    const s = new RenderScheduler(fn, new BitmapCache<FakeBitmap>(1e9));
    void s.request({ ...key(1), pageIndex: 0, priority: 5 });
    void s.request({ ...key(2), pageIndex: 1, priority: 1 });
    void s.request({ ...key(3), pageIndex: 2, priority: 3 });
    await flush();
    // The first request started immediately; the rest wait in priority order.
    expect(calls.map((c) => c.pageIndex)).toEqual([0]);
    calls[0]!.resolve(new FakeBitmap(1, 1));
    await flush();
    calls[1]!.resolve(new FakeBitmap(1, 1));
    await flush();
    expect(calls.map((c) => c.pageIndex)).toEqual([0, 1, 2]);
  });

  it('shares one render between identical requests and serves the cache afterwards', async () => {
    const { fn, calls } = deferredRender();
    const s = new RenderScheduler(fn, new BitmapCache<FakeBitmap>(1e9));
    const p1 = s.request({ ...key(1), pageIndex: 0, priority: 0 });
    const p2 = s.request({ ...key(1), pageIndex: 0, priority: 0 });
    await flush();
    const bmp = new FakeBitmap(1, 1);
    calls[0]!.resolve(bmp);
    expect(await p1).toBe(bmp);
    expect(await p2).toBe(bmp);
    expect(await s.request({ ...key(1), pageIndex: 0, priority: 0 })).toBe(bmp);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('drops queued work whose requester went away', async () => {
    const { fn, calls } = deferredRender();
    const s = new RenderScheduler(fn, new BitmapCache<FakeBitmap>(1e9));
    void s.request({ ...key(1), pageIndex: 0, priority: 0 });
    const controller = new AbortController();
    const p = s.request({ ...key(2), pageIndex: 1, priority: 1 }, controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(s.pending).toBe(0);
    calls[0]!.resolve(new FakeBitmap(1, 1));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('discards in-flight results after a structural change', async () => {
    const { fn, calls } = deferredRender();
    const cache = new BitmapCache<FakeBitmap>(1e9);
    const s = new RenderScheduler(fn, cache);
    const p = s.request({ ...key(1), pageIndex: 0, priority: 0 });
    await flush();
    s.invalidateStructure();
    const bmp = new FakeBitmap(1, 1);
    calls[0]!.resolve(bmp);
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(bmp.closed).toBe(true);
    expect(cache.size).toBe(0);
  });
});
