import { Lock } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button.tsx';
import styles from '../../components/Dialog.module.css';
import { cancelPassword, submitPassword } from '../../state/actions.ts';
import type { PasswordPrompt } from '../../state/store.ts';

/** Native <dialog>: focus trapping, Esc to cancel and the backdrop come for free. */
export function PasswordDialog({ prompt }: { readonly prompt: PasswordPrompt }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`${inputId}-title`}
      onCancel={(e) => {
        e.preventDefault();
        void cancelPassword();
      }}
    >
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          await submitPassword(password);
          setSubmitting(false);
          setPassword('');
        }}
      >
        <h2 id={`${inputId}-title`} className={styles.title}>
          {prompt.name} is password-protected
        </h2>
        <p className={styles.body}>
          Enter the password to open it. It stays in memory only while the file is open.
        </p>
        <label className={styles.field} htmlFor={inputId}>
          Password
          <input
            id={inputId}
            className={styles.input}
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={prompt.error ? true : undefined}
            aria-describedby={prompt.error ? errorId : undefined}
          />
          {prompt.error && (
            <span id={errorId} className={styles.error} role="alert">
              {prompt.error}. Check it and try again.
            </span>
          )}
        </label>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void cancelPassword()}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" icon={<Lock />} disabled={!password || submitting}>
            Unlock PDF
          </Button>
        </div>
      </form>
    </dialog>
  );
}
