import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { CSS_PX_PER_POINT, pageSizeOnScreen } from '../../lib/coords.ts';
import { setCurrentPage, setFittedZoom, zoomIn, zoomOut } from '../../state/actions.ts';
import { useApp, type OpenDoc } from '../../state/store.ts';
import { PageView } from './PageView.tsx';
import styles from './Viewer.module.css';

const PADDING = 24; // px around the pages
const GAP = 20; // px between pages (--page-gap)

/** The scrolling page list. Only pages near the viewport exist in the DOM. */
export function Viewer({ doc, dpr }: { readonly doc: OpenDoc; readonly dpr: number }) {
  const zoom = useApp((s) => s.zoom);
  const fit = useApp((s) => s.fit);
  const scrollTarget = useApp((s) => s.scrollTarget);
  const editText = useApp((s) => s.tool === 'editText');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { pages } = doc.info;

  // TanStack Virtual re-renders on scroll by design, so React Compiler skipping memoisation here is fine.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: pages.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (i) => pageSizeOnScreen(pages[i]!, zoom).height + GAP,
    paddingStart: PADDING,
    paddingEnd: PADDING - GAP,
    overscan: 2,
    getItemKey: (i) => pages[i]!.key,
  });

  // Fit to width: recompute zoom whenever the viewport resizes or pages change.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || fit !== 'width') return;
    const widest = Math.max(...pages.map((p) => p.width));
    const update = () => {
      const available = el.clientWidth - PADDING * 2;
      if (available > 0) setFittedZoom(Math.min(2, available / (widest * CSS_PX_PER_POINT)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, pages]);

  // Sizes depend on zoom and page sizes; keep the current page in place when they change.
  const currentPage = useApp((s) => s.currentPage);
  const anchor = useRef(currentPage);
  anchor.current = currentPage;
  useLayoutEffect(() => {
    virtualizer.measure();
    if (anchor.current > 0) virtualizer.scrollToIndex(anchor.current, { align: 'start' });
  }, [zoom, pages, virtualizer]);

  useEffect(() => {
    if (scrollTarget) virtualizer.scrollToIndex(scrollTarget.index, { align: 'start' });
  }, [scrollTarget, virtualizer]);

  // Ctrl + mouse wheel zooms (needs a non-passive listener to stop the browser zooming).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const items = virtualizer.getVirtualItems();

  // The current page is the one under a line a third of the way down the viewport.
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight / 3;
    const hit = items.find((item) => item.start <= line && item.end > line) ?? items[0];
    if (hit) setCurrentPage(hit.index);
  };

  const trackWidth = Math.max(...pages.map((p) => pageSizeOnScreen(p, zoom).width)) + PADDING * 2;

  return (
    <div ref={scrollerRef} className={styles.scroller} onScroll={onScroll} tabIndex={-1}>
      <div className={styles.track} style={{ height: virtualizer.getTotalSize(), width: trackWidth }}>
        {items.map((item) => {
          const page = pages[item.index]!;
          return (
            <div key={item.key} className={styles.item} style={{ top: item.start }}>
              <PageView
                docId={doc.id}
                page={page}
                index={item.index}
                zoom={zoom}
                dpr={dpr}
                // Pages actually on screen render before the overscan ones.
                priority={Math.abs(item.index - currentPage)}
                editText={editText}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
