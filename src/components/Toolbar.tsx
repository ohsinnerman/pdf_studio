import type { ReactNode } from 'react';
import styles from './Toolbar.module.css';

export function Toolbar({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className={styles.toolbar}>
      {children}
    </div>
  );
}

export function ToolbarGroup({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {children}
    </div>
  );
}

export const ToolbarDivider = () => <div aria-hidden className={styles.divider} />;
export const ToolbarSpacer = () => <div aria-hidden className={styles.spacer} />;
