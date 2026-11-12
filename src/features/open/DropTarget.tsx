import { useEffect, useState } from 'react';
import { fileToOpened } from '../../platform/index.ts';
import { notify, openFile } from '../../state/actions.ts';
import styles from './DropTarget.module.css';

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

/**
 * The whole window accepts a dropped PDF. Tauri's own drag-and-drop is turned
 * off (tauri.conf.json), so this works identically in the app and the browser.
 */
export function DropTarget() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let depth = 0; // dragenter/leave fire for every child element
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      const pdf = files.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (!pdf) {
        notify('error', "That isn't a PDF. Drop a file ending in .pdf.");
        return;
      }
      await openFile(await fileToOpened(pdf));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!active) return null;
  return (
    <div className={styles.overlay} aria-hidden>
      <p className={styles.label}>Drop to open</p>
    </div>
  );
}
