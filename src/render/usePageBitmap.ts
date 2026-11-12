import { useEffect, useState } from 'react';
import type { PageInfo } from '../engine/api.ts';
import { CancelledError, renderer, roundScale } from './index.ts';

interface Shown {
  readonly id: string;
  readonly bitmap: ImageBitmap;
}

/**
 * The bitmap to show for a page. Returns the sharpest cached render of this page
 * revision straight away (possibly blurry), then the sharp render once ready, so
 * pages never flash blank while zooming or scrolling back.
 */
export function usePageBitmap(options: {
  readonly docId: string;
  readonly page: PageInfo;
  readonly pageIndex: number;
  readonly scale: number;
  readonly priority: number;
  readonly enabled: boolean;
}): ImageBitmap | null {
  const { docId, page, pageIndex, scale, priority, enabled } = options;
  const id = `${docId}|${page.key}|${page.revision}`;
  const [rendered, setRendered] = useState<Shown | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const key = { docId, pageKey: page.key, revision: page.revision };
    if (renderer.cache.get({ ...key, scale: roundScale(scale) })) return; // served below, no render needed
    const controller = new AbortController();
    renderer.request({ ...key, scale, pageIndex, priority }, controller.signal).then(
      (bitmap) => {
        if (!controller.signal.aborted) setRendered({ id, bitmap });
      },
      (err: unknown) => {
        if (!(err instanceof CancelledError)) console.error('Render failed', err);
      },
    );
    return () => controller.abort();
  }, [id, docId, page.key, page.revision, pageIndex, scale, priority, enabled]);

  // Exact cache hit wins; then a fresh render for this revision; then any scale as a placeholder.
  const key = { docId, pageKey: page.key, revision: page.revision };
  const exact = renderer.cache.get({ ...key, scale: roundScale(scale) });
  if (exact) return exact;
  if (rendered?.id === id && rendered.bitmap.width > 0) return rendered.bitmap;
  return renderer.cache.getBest(key)?.bitmap ?? null;
}
