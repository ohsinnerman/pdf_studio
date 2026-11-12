import type { PageInfo, TextLine } from '../../engine/api.ts';
import { getEngine } from '../../engine/client.ts';
import { usePageData } from '../../lib/usePageData.ts';

const load = (docId: string, pageIndex: number) => getEngine().getTextLines(docId, pageIndex);

/** Text lines of a page, refetched whenever the page changes. */
export function useTextLines(docId: string, page: PageInfo, pageIndex: number): TextLine[] | null {
  return usePageData('text-lines', docId, page, pageIndex, load);
}
