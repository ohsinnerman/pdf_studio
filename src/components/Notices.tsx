import { Info, TriangleAlert, X } from 'lucide-react';
import { dismissNotice } from '../state/actions.ts';
import { useApp } from '../state/store.ts';
import styles from './Notices.module.css';

/** Short-lived messages in the bottom-right corner. Errors are announced to screen readers. */
export function Notices() {
  const notices = useApp((s) => s.notices);
  return (
    <div className={styles.stack} aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.id}
          className={styles.notice}
          data-kind={n.kind}
          role={n.kind === 'error' ? 'alert' : 'status'}
        >
          {n.kind === 'error' ? <TriangleAlert aria-hidden /> : <Info aria-hidden />}
          <p>{n.text}</p>
          <button
            type="button"
            className={styles.close}
            aria-label="Dismiss"
            onClick={() => dismissNotice(n.id)}
          >
            <X aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
