import { Redo2, Save, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { AppMark } from './components/AppMark.tsx';
import { Button, IconButton } from './components/Button.tsx';
import { Toolbar, ToolbarDivider, ToolbarGroup, ToolbarSpacer } from './components/Toolbar.tsx';
import { EmptyState } from './features/empty/EmptyState.tsx';
import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.app}>
      <Toolbar label="Main">
        <div className={styles.brand}>
          <AppMark />
          <span>PDF Studio</span>
        </div>
        <ToolbarSpacer />
        <ToolbarGroup label="History">
          <IconButton label="Undo" shortcut="Ctrl+Z" icon={<Undo2 />} disabled />
          <IconButton label="Redo" shortcut="Ctrl+Y" icon={<Redo2 />} disabled />
        </ToolbarGroup>
        <ToolbarDivider />
        <ToolbarGroup label="Zoom">
          <IconButton label="Zoom out" shortcut="Ctrl+-" icon={<ZoomOut />} disabled />
          <IconButton label="Zoom in" shortcut="Ctrl+=" icon={<ZoomIn />} disabled />
        </ToolbarGroup>
        <ToolbarDivider />
        <Button variant="primary" icon={<Save />} disabled>
          Save
        </Button>
      </Toolbar>

      <div className={`${styles.body} ${styles.bodyNoSidebar}`}>
        <main className={styles.viewport}>
          <EmptyState onOpen={() => undefined} />
        </main>
      </div>

      <footer className={styles.statusbar}>
        <span>No document open</span>
      </footer>
    </div>
  );
}
