import { getEngine } from '../engine/client.ts';
import { BitmapCache } from './cache.ts';
import { RenderScheduler } from './scheduler.ts';

export { CancelledError } from './scheduler.ts';
export { roundScale } from './cache.ts';

/** Rendered bitmaps may use this much memory before the least recently used are dropped. */
const CACHE_BUDGET_BYTES = 384 * 1024 * 1024;

/** The app-wide render scheduler: engine worker → RGBA → ImageBitmap → cache. */
export const renderer = new RenderScheduler<ImageBitmap>(async (docId, pageIndex, scale) => {
  const { width, height, pixels } = await getEngine().render(docId, pageIndex, scale);
  return createImageBitmap(new ImageData(pixels, width, height));
}, new BitmapCache<ImageBitmap>(CACHE_BUDGET_BYTES));
