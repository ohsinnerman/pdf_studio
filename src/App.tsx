import { FolderOpen, MoveHorizontal, Redo2, Save, SaveAll, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { platform } from './platform/index.ts';
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
  installCloseGuard,
  openFromDialog,
  redo,
  rotateTargets,
  save,
  saveAs,
  selectAllPages,
  undo,
  windowTitle,
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
  const title = windowTitle(doc);

  useEffect(() => {
    void platform.setWindowTitle(title);
  }, [title]);
  useEffect(() => installCloseGuard(), []);

  const shortcuts = useMemo<ShortcutMap>(
    () => ({
      'Ctrl+O': () => void openFromDialog(),
      'Ctrl+S': () => void save(),
      'Ctrl+Shift+S': () => void saveAs(),
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
          {doc?.info.dirty && <span className={styles.dirty} role="img" aria-label="Unsaved changes" />}
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
        <IconButton
          label="Save as…"
          shortcut="Ctrl+Shift+S"
          icon={<SaveAll />}
          onClick={() => void saveAs()}
          disabled={!doc || !!busy}
        />
        <Button
          variant="primary"
          icon={<Save />}
          onClick={() => void save()}
          disabled={!doc || !!busy}
          title="Save (Ctrl+S)"
        >
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
