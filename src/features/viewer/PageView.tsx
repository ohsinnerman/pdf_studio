import { memo, useLayoutEffect, useRef } from 'react';
import type { PageInfo } from '../../engine/api.ts';
import { pageSizeOnScreen, renderScale } from '../../lib/coords.ts';
import { usePageBitmap } from '../../render/usePageBitmap.ts';
import { TextLayer } from '../edit-text/TextLayer.tsx';
import styles from './Viewer.module.css';

interface PageViewProps {
  readonly docId: string;
  readonly page: PageInfo;
  readonly index: number;
  readonly zoom: number;
  readonly dpr: number;
  readonly priority: number;
  /** Show the Edit text overlay. */
  readonly editText: boolean;
}

/** One page: a sized paper rectangle with the engine's bitmap drawn into a canvas. */
export const PageView = memo(function PageView({
  docId,
  page,
  index,
  zoom,
  dpr,
  priority,
  editText,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = pageSizeOnScreen(page, zoom);
  const scale = renderScale(page, zoom, dpr);
  const bitmap = usePageBitmap({ docId, page, pageIndex: index, scale, priority, enabled: true });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || bitmap.width === 0) return;
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [bitmap]);

  return (
    <div
      className={styles.page}
      style={{ width: size.width, height: size.height }}
      role={editText ? 'group' : 'img'}
      aria-label={`Page ${index + 1}`}
      data-page={index}
    >
      <canvas ref={canvasRef} className={styles.canvas} hidden={!bitmap} />
      {editText && <TextLayer docId={docId} page={page} index={index} zoom={zoom} />}
    </div>
  );
});
