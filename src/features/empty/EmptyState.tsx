import { FolderOpen, ShieldCheck } from 'lucide-react';
import { AppMark } from '../../components/AppMark.tsx';
import { Button } from '../../components/Button.tsx';
import styles from './EmptyState.module.css';

export function EmptyState({
  onOpen,
  busy = false,
}: {
  readonly onOpen: () => void;
  readonly busy?: boolean;
}) {
  return (
    <div className={styles.wrap}>
      <section className={styles.card} aria-labelledby="empty-title">
        <AppMark size={48} />
        <h1 id="empty-title" className={styles.headline}>
          Open a PDF to start
        </h1>
        <p className={styles.lede}>Rotate, reorder, delete and merge pages, then save a clean copy.</p>
        <div className={styles.actions}>
          <Button variant="primary" icon={<FolderOpen />} onClick={onOpen} disabled={busy}>
            {busy ? 'Opening…' : 'Open PDF'}
          </Button>
        </div>
        <p className={styles.hint}>
          or drop a file anywhere · <kbd>Ctrl</kbd> <kbd>O</kbd>
        </p>
        <p className={styles.privacy}>
          <ShieldCheck aria-hidden />
          Files never leave this computer.
        </p>
      </section>
    </div>
  );
}
