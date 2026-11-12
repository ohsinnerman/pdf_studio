import { memo, useLayoutEffect, useRef } from 'react';
import type { PageInfo } from '../../engine/api.ts';
import { pageSizeOnScreen, renderScale } from '../../lib/coords.ts';
import { usePageBitmap } from '../../render/usePageBitmap.ts';
import { AnnotationLayer } from '../annotate/AnnotationLayer.tsx';
import { TextLayer } from '../edit-text/TextLayer.tsx';
import { FieldLayer } from '../forms/FieldLayer.tsx';
import type { Tool } from '../../state/store.ts';
import styles from './Viewer.module.css';

interface PageViewProps {
  readonly docId: string;
  readonly page: PageInfo;
  readonly index: number;
  readonly zoom: number;
  readonly dpr: number;
  readonly priority: number;
  /** The active tool decides which overlay the page gets. */
  readonly tool: Tool;
}

/** One page: a sized paper rectangle with the engine's bitmap drawn into a canvas. */
export const PageView = memo(function PageView({
  docId,
  page,
  index,
  zoom,
  dpr,
  priority,
  tool,
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
      role="group"
      aria-label={`Page ${index + 1}`}
      data-page={index}
    >
      <canvas ref={canvasRef} className={styles.canvas} hidden={!bitmap} />
      {tool === 'editText' ? (
        <TextLayer docId={docId} page={page} index={index} zoom={zoom} />
      ) : (
        // Keyed by tool: switching tools abandons whatever was half-drawn.
        <AnnotationLayer key={tool} docId={docId} page={page} index={index} zoom={zoom} />
      )}
      {/* Form fields sit on top so they can be clicked and typed into. */}
      {tool === 'select' && <FieldLayer docId={docId} page={page} index={index} zoom={zoom} />}
    </div>
  );
});
