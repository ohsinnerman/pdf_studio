import { Wrench } from 'lucide-react';
import { pointsToMm } from '../../lib/coords.ts';
import { useApp } from '../../state/store.ts';
import styles from '../../App.module.css';

export function StatusBar() {
  const doc = useApp((s) => s.doc);
  const currentPage = useApp((s) => s.currentPage);
  const zoom = useApp((s) => s.zoom);
  const busy = useApp((s) => s.busy);

  if (!doc) {
    return (
      <footer className={styles.statusbar}>
        <span>{busy ?? 'No document open'}</span>
      </footer>
    );
  }

  const page = doc.info.pages[currentPage];
  const mm = (pt: number) => Math.round(pointsToMm(pt));
  return (
    <footer className={styles.statusbar}>
      <span>
        Page <span className="num">{currentPage + 1}</span> of{' '}
        <span className="num">{doc.info.pages.length}</span>
      </span>
      {page && (
        <span className="num" title="Page size">
          {mm(page.width)} × {mm(page.height)} mm
        </span>
      )}
      {busy && <span>{busy}</span>}
      <span className={styles.statusSpacer} />
      {doc.info.wasRepaired && (
        <span className={styles.notice} title="The file was damaged; saving writes a repaired copy.">
          <Wrench aria-hidden /> Repaired on open
        </span>
      )}
      <span className="num" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>
        {Math.round(zoom * 100)}%
      </span>
    </footer>
  );
}
