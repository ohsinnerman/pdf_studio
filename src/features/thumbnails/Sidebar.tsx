import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FilePlus2, FileUp, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from '../../components/Button.tsx';
import { deleteTargets, insertBlankPage, insertPdf, movePages, rotateTargets } from '../../state/actions.ts';
import { useApp, type OpenDoc } from '../../state/store.ts';
import styles from './Sidebar.module.css';
import { Thumbnail } from './Thumbnail.tsx';

export function Sidebar({ doc, dpr }: { readonly doc: OpenDoc; readonly dpr: number }) {
  const selection = useApp((s) => s.selection);
  const currentPage = useApp((s) => s.currentPage);
  const busy = useApp((s) => s.busy);
  const { pages } = doc.info;
  const keys = pages.map((p) => p.key);
  const selected = new Set(selection);
  const listRef = useRef<HTMLOListElement>(null);

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks working as clicks.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) void movePages(Number(active.id), Number(over.id));
  };

  // Keep the current page's thumbnail in view as the main view scrolls.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${currentPage}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  const count = selection.length;
  const target = count > 1 ? `${count} pages` : 'page';

  return (
    <aside className={styles.sidebar} aria-label="Pages">
      <div className={styles.header}>
        <span className={styles.title}>
          {count > 0 ? (
            <>
              <span className="num">{count}</span> selected
            </>
          ) : (
            <>
              <span className="num">{pages.length}</span> {pages.length === 1 ? 'page' : 'pages'}
            </>
          )}
        </span>
      </div>
      <div className={styles.actions} role="toolbar" aria-label="Page actions">
        <IconButton
          label={`Rotate ${target} left`}
          shortcut="Ctrl+["
          icon={<RotateCcw />}
          onClick={() => void rotateTargets(270)}
        />
        <IconButton
          label={`Rotate ${target} right`}
          shortcut="Ctrl+]"
          icon={<RotateCw />}
          onClick={() => void rotateTargets(90)}
        />
        <IconButton
          label={`Delete ${target}`}
          shortcut="Delete"
          icon={<Trash2 />}
          onClick={() => void deleteTargets()}
          disabled={pages.length <= 1}
        />
        <IconButton
          label="Insert blank page after"
          icon={<FilePlus2 />}
          onClick={() => void insertBlankPage()}
        />
        <IconButton
          label="Insert PDF after…"
          icon={<FileUp />}
          onClick={() => void insertPdf()}
          disabled={!!busy}
        />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ol ref={listRef} className={styles.list}>
            {pages.map((page, index) => (
              <Thumbnail
                key={page.key}
                docId={doc.id}
                page={page}
                index={index}
                selected={selected.has(page.key)}
                current={index === currentPage}
                dpr={dpr}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </aside>
  );
}
