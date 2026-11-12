import { useEffect, useState } from 'react';
import type { PageInfo, TextLine } from '../../engine/api.ts';
import { getEngine } from '../../engine/client.ts';

/**
 * Text lines of a page, cached by page revision (a revision bump means the page
 * changed, so its lines are fetched again).
 */
const cache = new Map<string, Promise<TextLine[]>>();
const MAX_ENTRIES = 200;

function load(docId: string, page: PageInfo, pageIndex: number): Promise<TextLine[]> {
  const id = `${docId}|${page.key}|${page.revision}`;
  let entry = cache.get(id);
  if (!entry) {
    entry = getEngine().getTextLines(docId, pageIndex);
    entry.catch(() => cache.delete(id));
    cache.set(id, entry);
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  return entry;
}

export function useTextLines(docId: string, page: PageInfo, pageIndex: number): TextLine[] | null {
  const id = `${docId}|${page.key}|${page.revision}`;
  const [state, setState] = useState<{ id: string; lines: TextLine[] } | null>(null);

  useEffect(() => {
    let alive = true;
    load(docId, page, pageIndex).then(
      (lines) => alive && setState({ id, lines }),
      (err: unknown) => console.error('Could not read text lines', err),
    );
    return () => {
      alive = false;
    };
    // page.key/revision are captured in `id`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pageIndex]);

  return state?.id === id ? state.lines : null;
}
