import { useEffect, useState } from 'react';
import type { PageInfo } from '../engine/api.ts';

/**
 * Data read from the engine for one page (text lines, annotations, form
 * fields), cached by page revision. A revision bump means the page changed,
 * so the data is fetched again; old entries simply age out.
 */
const caches = new Map<string, Map<string, Promise<unknown>>>();
const MAX_ENTRIES = 200;

export function usePageData<T>(
  kind: string,
  docId: string,
  page: PageInfo,
  pageIndex: number,
  load: (docId: string, pageIndex: number) => Promise<T>,
): T | null {
  const id = `${docId}|${page.key}|${page.revision}|${pageIndex}`;
  const [state, setState] = useState<{ id: string; data: T } | null>(null);

  useEffect(() => {
    let cache = caches.get(kind);
    if (!cache) caches.set(kind, (cache = new Map()));
    let entry = cache.get(id) as Promise<T> | undefined;
    if (!entry) {
      entry = load(docId, pageIndex);
      const c = cache;
      entry.catch(() => c.delete(id));
      cache.set(id, entry);
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    }
    let alive = true;
    entry.then(
      (data) => alive && setState({ id, data }),
      (err: unknown) => console.error(`Could not read ${kind}`, err),
    );
    return () => {
      alive = false;
    };
    // `load` is a stable module-level function; `id` captures everything else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  return state?.id === id ? state.data : null;
}
