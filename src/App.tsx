import { FolderOpen, MoveHorizontal, Redo2, Save, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo } from 'react';
import { AppMark } from './components/AppMark.tsx';
import { Button, IconButton } from './components/Button.tsx';
import { Notices } from './components/Notices.tsx';
import { Toolbar, ToolbarDivider, ToolbarGroup, ToolbarSpacer } from './components/Toolbar.tsx';
import { EmptyState } from './features/empty/EmptyState.tsx';
import { DropTarget } from './features/open/DropTarget.tsx';
import { PasswordDialog } from './features/open/PasswordDialog.tsx';
import { StatusBar } from './features/status/StatusBar.tsx';
import { Viewer } from './features/viewer/Viewer.tsx';
import { Sidebar } from './features/thumbnails/Sidebar.tsx';
import { useDevicePixelRatio } from './lib/useDevicePixelRatio.ts';
import {
  deleteTargets,
  fitWidth,
  openFromDialog,
  redo,
  rotateTargets,
  selectAllPages,
  undo,
  zoomIn,
  zoomOut,
} from './state/actions.ts';
import { useShortcuts, type ShortcutMap } from './state/shortcuts.ts';
import { MAX_ZOOM, MIN_ZOOM, useApp } from './state/store.ts';
import styles from './App.module.css';

export function App() {
  const doc = useApp((s) => s.doc);
  const zoom = useApp((s) => s.zoom);
  const fit = useApp((s) => s.fit);
  const busy = useApp((s) => s.busy);
  const passwordPrompt = useApp((s) => s.passwordPrompt);
  const dpr = useDevicePixelRatio();

  const shortcuts = useMemo<ShortcutMap>(
    () => ({
      'Ctrl+O': () => void openFromDialog(),
      'Ctrl+=': zoomIn,
      'Ctrl+Shift+=': zoomIn,
      'Ctrl+-': zoomOut,
      'Ctrl+0': fitWidth,
      'Ctrl+Z': () => void undo(),
      'Ctrl+Y': () => void redo(),
      'Ctrl+Shift+Z': () => void redo(),
      'Ctrl+A': selectAllPages,
      'Ctrl+[': () => void rotateTargets(270),
      'Ctrl+]': () => void rotateTargets(90),
      Delete: () => void deleteTargets(),
    }),
    [],
  );
  useShortcuts(shortcuts);

  return (
    <div className={styles.app}>
      <Toolbar label="Main">
        <div className={styles.brand}>
          <AppMark />
          <span className={styles.fileName} title={doc?.path ?? doc?.name}>
            {doc ? doc.name : 'PDF Studio'}
          </span>
        </div>
        <ToolbarGroup label="File">
          <IconButton
            label="Open PDF"
            shortcut="Ctrl+O"
            icon={<FolderOpen />}
            onClick={() => void openFromDialog()}
            disabled={!!busy}
          />
        </ToolbarGroup>
        <ToolbarSpacer />
        <ToolbarGroup label="History">
          <IconButton
            label={doc?.info.undoLabel ? `Undo ${doc.info.undoLabel.toLowerCase()}` : 'Undo'}
            shortcut="Ctrl+Z"
            icon={<Undo2 />}
            onClick={() => void undo()}
            disabled={!doc?.info.undoLabel}
          />
          <IconButton
            label={doc?.info.redoLabel ? `Redo ${doc.info.redoLabel.toLowerCase()}` : 'Redo'}
            shortcut="Ctrl+Y"
            icon={<Redo2 />}
            onClick={() => void redo()}
            disabled={!doc?.info.redoLabel}
          />
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup label="Zoom">
          <IconButton
            label="Zoom out"
            shortcut="Ctrl+-"
            icon={<ZoomOut />}
            onClick={zoomOut}
            disabled={!doc || zoom <= MIN_ZOOM}
          />
          <IconButton
            label="Fit width"
            shortcut="Ctrl+0"
            icon={<MoveHorizontal />}
            onClick={fitWidth}
            pressed={!!doc && fit === 'width'}
            disabled={!doc}
          />
          <IconButton
            label="Zoom in"
            shortcut="Ctrl+="
            icon={<ZoomIn />}
            onClick={zoomIn}
            disabled={!doc || zoom >= MAX_ZOOM}
          />
        </ToolbarGroup>
        <ToolbarDivider />
        <Button variant="primary" icon={<Save />} disabled>
          Save
        </Button>
      </Toolbar>

      <div className={doc ? styles.body : `${styles.body} ${styles.bodyNoSidebar}`}>
        {doc && <Sidebar key={doc.id} doc={doc} dpr={dpr} />}
        <main className={styles.viewport} aria-label="Document">
          {doc ? (
            <Viewer key={doc.id} doc={doc} dpr={dpr} />
          ) : (
            <EmptyState onOpen={() => void openFromDialog()} busy={!!busy} />
          )}
        </main>
      </div>

      <StatusBar />
      <Notices />
      <DropTarget />
      {passwordPrompt && <PasswordDialog key={passwordPrompt.docId} prompt={passwordPrompt} />}
    </div>
  );
}
