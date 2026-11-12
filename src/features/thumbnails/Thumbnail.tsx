import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PageInfo } from '../../engine/api.ts';
import { CSS_PX_PER_POINT } from '../../lib/coords.ts';
import { usePageBitmap } from '../../render/usePageBitmap.ts';
import { clickPage } from '../../state/actions.ts';
import styles from './Sidebar.module.css';

/** Thumbnails fit in this box (CSS px). */
const THUMB_BOX = { width: 136, height: 176 };

interface ThumbnailProps {
  readonly docId: string;
  readonly page: PageInfo;
  readonly index: number;
  readonly selected: boolean;
  readonly current: boolean;
  readonly dpr: number;
}

export const Thumbnail = memo(function Thumbnail({
  docId,
  page,
  index,
  selected,
  current,
  dpr,
}: ThumbnailProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.key,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Only render thumbnails that are (nearly) on screen.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      rootMargin: '200px 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const zoom = Math.min(THUMB_BOX.width / page.width, THUMB_BOX.height / page.height) / CSS_PX_PER_POINT;
  const width = page.width * zoom * CSS_PX_PER_POINT;
  const height = page.height * zoom * CSS_PX_PER_POINT;
  const scale = zoom * CSS_PX_PER_POINT * Math.max(1, dpr);
  // Thumbnails render after the main view (priority 100+).
  const bitmap = usePageBitmap({
    docId,
    page,
    pageIndex: index,
    scale,
    priority: 100 + index,
    enabled: visible,
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || bitmap.width === 0) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [bitmap]);

  return (
    <li
      ref={setNodeRef}
      className={styles.item}
      data-index={index}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        // dnd-kit's attributes first, so our selection state wins over its aria-pressed.
        {...attributes}
        {...listeners}
        type="button"
        className={styles.thumb}
        aria-label={`Page ${index + 1}`}
        aria-pressed={selected}
        aria-current={current ? 'page' : undefined}
        onClick={(e) => clickPage(page.key, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })}
      >
        <div ref={boxRef} className={styles.paper} style={{ width, height }}>
          <canvas ref={canvasRef} className={styles.canvas} hidden={!bitmap} />
        </div>
        <span className={`${styles.number} num`}>{index + 1}</span>
      </button>
    </li>
  );
});
