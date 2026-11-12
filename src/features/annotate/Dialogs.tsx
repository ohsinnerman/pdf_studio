import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Point, Rect } from '../../engine/api.ts';
import { Button } from '../../components/Button.tsx';
import dialogStyles from '../../components/Dialog.module.css';
import {
  applyRedactions,
  createAnnotation,
  fitRect,
  placeImage,
  updateAnnotation,
} from '../../state/annotations.ts';
import { useApp, type PendingDialog } from '../../state/store.ts';
import { platform } from '../../platform/index.ts';
import styles from './Dialogs.module.css';

const close = () => useApp.setState({ dialog: null });

/** Shows whichever dialog a tool asked for. */
export function ToolDialogs() {
  const dialog = useApp((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'note':
      return <NoteDialog key={dialog.id ?? 'new'} dialog={dialog} />;
    case 'signature':
      return <SignatureDialog dialog={dialog} />;
    case 'confirmRedactions':
      return <ConfirmRedactionsDialog />;
  }
}

function Modal({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={dialogStyles.dialog}
      style={wide ? { width: 'min(560px, calc(100vw - 32px))' } : undefined}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <h2 id={titleId} className={dialogStyles.title}>
        {title}
      </h2>
      {children}
    </dialog>
  );
}

// ---------- Note ----------

function NoteDialog({ dialog }: { dialog: Extract<PendingDialog, { kind: 'note' }> }) {
  const [text, setText] = useState(dialog.contents);
  const st = useApp((s) => s.styles.note);
  const save = async () => {
    close();
    if (dialog.id) {
      if (text !== dialog.contents) await updateAnnotation(dialog.pageIndex, dialog.id, { contents: text });
    } else if (text.trim()) {
      await createAnnotation(dialog.pageIndex, {
        kind: 'note',
        at: dialog.at,
        contents: text,
        color: st.color,
      });
    }
  };
  return (
    <Modal title={dialog.id ? 'Edit note' : 'Add a note'}>
      <textarea
        className={`${dialogStyles.input} ${styles.noteText}`}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
        }}
        aria-label="Note text"
        placeholder="Write a comment"
      />
      <div className={dialogStyles.actions}>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={!dialog.id && !text.trim()}>
          {dialog.id ? 'Save note' : 'Add note'}
        </Button>
      </div>
    </Modal>
  );
}

// ---------- Redactions ----------

function ConfirmRedactionsDialog() {
  return (
    <Modal title="Apply redactions?">
      <p className={dialogStyles.body}>
        Everything inside the marked boxes (text, images and drawings) will be{' '}
        <strong>removed from the file</strong>, not just covered, and replaced with black boxes. Undo can
        bring it back until you save; after saving it&apos;s gone for good.
      </p>
      <div className={dialogStyles.actions}>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void applyRedactions()}>
          Remove marked content
        </Button>
      </div>
    </Modal>
  );
}

// ---------- Signature ----------

type SavedSignature =
  { kind: 'ink'; strokes: Point[][]; width: number; height: number } | { kind: 'image'; dataUrl: string };
const STORAGE_KEY = 'pdf-studio.signature';

function loadSaved(): SavedSignature | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSignature) : null;
  } catch {
    return null;
  }
}
function saveSignature(sig: SavedSignature) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sig));
  } catch {
    /* storage unavailable: the signature just isn't remembered */
  }
}

const dataUrlToBytes = (url: string) =>
  Uint8Array.from(atob(url.split(',')[1] ?? ''), (c) => c.charCodeAt(0));

/** Draw (ink, stays vector), type (rendered to an image) or upload an image, then place it. */
function SignatureDialog({ dialog }: { dialog: Extract<PendingDialog, { kind: 'signature' }> }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState('');
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [remember, setRemember] = useState(true);
  const saved = loadSaved();
  const st = useApp((s) => s.styles.signature);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Point[] | null>(null);
  const PAD = { width: 480, height: 160 };

  // Redraw the pad whenever strokes change.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PAD.width, PAD.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#102070';
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }, [strokes, PAD.width, PAD.height]);

  const local = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PAD.width, ((e.clientY - r.top) / r.height) * PAD.height];
  };

  const placeInk = async (inkStrokes: Point[][], size: { width: number; height: number }) => {
    // Fit the drawing's own bounds (not the whole pad) into the target box.
    const xs = inkStrokes.flat().map((p) => p[0]);
    const ys = inkStrokes.flat().map((p) => p[1]);
    const [minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const target: Rect = fitRect(dialog.rect, { width: bw, height: bh }, 160);
    const k = (target[2] - target[0]) / bw;
    const mapped = inkStrokes.map((s) =>
      s.map(([x, y]) => [target[0] + (x - minX) * k, target[1] + (y - minY) * k] as Point),
    );
    void size;
    await createAnnotation(dialog.pageIndex, {
      kind: 'signature-ink',
      strokes: mapped,
      color: st.color,
      width: st.width,
    });
  };

  const placeDrawn = async () => {
    if (strokes.length === 0) return;
    if (remember) saveSignature({ kind: 'ink', strokes, ...PAD });
    close();
    await placeInk(strokes, PAD);
  };

  const placeTyped = async () => {
    if (!typed.trim()) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = "64px 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(typed).width) + 24;
    canvas.width = w;
    canvas.height = 96;
    ctx.font = font;
    ctx.fillStyle = '#102070';
    ctx.textBaseline = 'middle';
    ctx.fillText(typed, 12, 50);
    const dataUrl = canvas.toDataURL('image/png');
    if (remember) saveSignature({ kind: 'image', dataUrl });
    close();
    await placeImage(dialog.pageIndex, dialog.rect, dataUrlToBytes(dataUrl), 'signature-image');
  };

  const placeFromImage = async () => {
    const file = await platform.openImage();
    if (!file) return;
    close();
    await placeImage(dialog.pageIndex, dialog.rect, file.bytes, 'signature-image');
  };

  const placeSaved = async () => {
    if (!saved) return;
    close();
    if (saved.kind === 'ink') await placeInk(saved.strokes, saved);
    else await placeImage(dialog.pageIndex, dialog.rect, dataUrlToBytes(saved.dataUrl), 'signature-image');
  };

  return (
    <Modal title="Add your signature" wide>
      <div className={styles.tabs} role="tablist" aria-label="Signature type">
        {(['draw', 'type'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={styles.tab}
            onClick={() => setMode(m)}
          >
            {m === 'draw' ? 'Draw' : 'Type'}
          </button>
        ))}
        <button type="button" className={styles.tab} onClick={() => void placeFromImage()}>
          Image…
        </button>
        {saved && (
          <button type="button" className={styles.tab} onClick={() => void placeSaved()}>
            Use saved signature
          </button>
        )}
      </div>

      {mode === 'draw' ? (
        <div className={styles.padWrap}>
          <canvas
            ref={canvasRef}
            className={styles.pad}
            width={PAD.width}
            height={PAD.height}
            aria-label="Signature pad: draw with the mouse or a pen"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = [local(e)];
              setStrokes((s) => [...s, drawing.current!]);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              drawing.current.push(local(e));
              setStrokes((s) => [...s.slice(0, -1), [...drawing.current!]]);
            }}
            onPointerUp={() => (drawing.current = null)}
          />
          <p className={styles.padHint}>Sign above</p>
        </div>
      ) : (
        <input
          className={`${dialogStyles.input} ${styles.typed}`}
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Your name"
          aria-label="Type your name"
        />
      )}

      <label className={styles.remember}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this computer
      </label>

      <div className={dialogStyles.actions}>
        {mode === 'draw' && (
          <Button variant="ghost" onClick={() => setStrokes([])} disabled={strokes.length === 0}>
            Clear
          </Button>
        )}
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => void (mode === 'draw' ? placeDrawn() : placeTyped())}
          disabled={mode === 'draw' ? strokes.length === 0 : !typed.trim()}
        >
          Place signature
        </Button>
      </div>
    </Modal>
  );
}
