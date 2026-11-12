import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AnnotationInfo, PageInfo, Point, Quad, Rect } from '../../engine/api.ts';
import { cssScale } from '../../lib/coords.ts';
import {
  createAnnotation,
  insertImage,
  moveAnnotation,
  openNoteEditor,
  selectAnnotation,
  selectionQuads,
  updateAnnotation,
  useAnnotations,
} from '../../state/annotations.ts';
import { useApp, type Tool } from '../../state/store.ts';
import { cssFont, rgbCss } from '../edit-text/fonts.ts';
import styles from './AnnotationLayer.module.css';

interface LayerProps {
  readonly docId: string;
  readonly page: PageInfo;
  readonly index: number;
  readonly zoom: number;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** What the pointer is doing right now. Kept in a ref: it changes every mouse move. */
type Gesture =
  | { kind: 'rect'; start: Point }
  | { kind: 'line'; start: Point }
  | { kind: 'ink'; points: Point[] }
  | { kind: 'markup'; start: Point; seq: number }
  | { kind: 'move'; annot: AnnotationInfo; start: Point }
  | { kind: 'resize'; annot: AnnotationInfo; handle: Handle; start: Point };

/** What to preview while dragging (in page space). */
type Draft =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'line'; a: Point; b: Point }
  | { kind: 'ink'; points: readonly Point[] }
  | { kind: 'quads'; quads: readonly Quad[] }
  | { kind: 'ghost'; rect: Rect };

/** A text box being typed into: new (no id) or existing. */
interface TextboxDraft {
  readonly id: string | null;
  readonly rect: Rect;
  readonly contents: string;
}

const RECT_TOOLS: readonly Tool[] = [
  'rectangle',
  'ellipse',
  'whiteout',
  'redaction',
  'textbox',
  'image',
  'signature',
];
const MARKUP_TOOLS: readonly Tool[] = ['highlight', 'underline', 'strikeout'];

const norm = ([x0, y0, x1, y1]: Rect): Rect => [
  Math.min(x0, x1),
  Math.min(y0, y1),
  Math.max(x0, x1),
  Math.max(y0, y1),
];
const tiny = ([x0, y0, x1, y1]: Rect, min = 4) => Math.abs(x1 - x0) < min && Math.abs(y1 - y0) < min;

function resized(rect: Rect, handle: Handle, dx: number, dy: number): Rect {
  let [x0, y0, x1, y1] = rect;
  if (handle.includes('w')) x0 += dx;
  if (handle.includes('e')) x1 += dx;
  if (handle.includes('n')) y0 += dy;
  if (handle.includes('s')) y1 += dy;
  return norm([x0, y0, x1, y1]);
}

/**
 * Drawing and selection overlay for one page (all tools except Edit text).
 * The engine draws the real annotations into the page bitmap; this layer only
 * draws temporary things: previews while dragging, selection handles, editors.
 */
export function AnnotationLayer({ docId, page, index, zoom }: LayerProps) {
  const tool = useApp((s) => s.tool);
  const style = useApp((s) => s.styles[s.tool]);
  const selected = useApp((s) => (s.selectedAnnot?.pageKey === page.key ? s.selectedAnnot.id : null));
  const annots = useAnnotations(docId, page, index);
  const layerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textbox, setTextbox] = useState<TextboxDraft | null>(null);
  const s = cssScale(zoom);

  const toPage = (e: { clientX: number; clientY: number }): Point => {
    const r = layerRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
  };

  const selectedAnnot = annots?.find((a) => a.id === selected) ?? null;

  // ---------- Pointer handling ----------

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || textbox) return;
    const p = toPage(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === 'select') {
      selectAnnotation(index, null);
      return;
    }
    if (tool === 'note') {
      useApp.setState({ dialog: { kind: 'note', pageIndex: index, at: p, contents: '' } });
      return;
    }
    if (RECT_TOOLS.includes(tool)) gesture.current = { kind: 'rect', start: p };
    else if (tool === 'line' || tool === 'arrow') gesture.current = { kind: 'line', start: p };
    else if (tool === 'ink') gesture.current = { kind: 'ink', points: [p] };
    else if (MARKUP_TOOLS.includes(tool)) gesture.current = { kind: 'markup', start: p, seq: 0 };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toPage(e);
    switch (g.kind) {
      case 'rect':
        setDraft({ kind: 'rect', rect: norm([g.start[0], g.start[1], p[0], p[1]]) });
        return;
      case 'line':
        setDraft({ kind: 'line', a: g.start, b: p });
        return;
      case 'ink': {
        const last = g.points.at(-1)!;
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.75 / zoom) g.points.push(p);
        setDraft({ kind: 'ink', points: [...g.points] });
        return;
      }
      case 'markup': {
        const seq = ++g.seq;
        void selectionQuads(index, g.start, p).then((quads) => {
          if (gesture.current === g && g.seq === seq) setDraft({ kind: 'quads', quads });
        });
        return;
      }
      case 'move': {
        const [dx, dy] = [p[0] - g.start[0], p[1] - g.start[1]];
        const [x0, y0, x1, y1] = g.annot.rect;
        setDraft({ kind: 'ghost', rect: [x0 + dx, y0 + dy, x1 + dx, y1 + dy] });
        return;
      }
      case 'resize':
        setDraft({
          kind: 'ghost',
          rect: resized(g.annot.rect, g.handle, p[0] - g.start[0], p[1] - g.start[1]),
        });
    }
  };

  const onPointerUp = async (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const p = toPage(e);
    setDraft(null);

    switch (g.kind) {
      case 'rect': {
        const rect = norm([g.start[0], g.start[1], p[0], p[1]]);
        if (tool === 'image') return void insertImage(index, rect);
        if (tool === 'signature') {
          useApp.setState({ dialog: { kind: 'signature', pageIndex: index, rect } });
          return;
        }
        if (tool === 'textbox') {
          const r: Rect = tiny(rect, 12)
            ? [rect[0], rect[1], rect[0] + 220, rect[1] + style.fontSize * 2]
            : rect;
          setTextbox({ id: null, rect: r, contents: '' });
          return;
        }
        if (tiny(rect)) return;
        if (tool === 'whiteout' || tool === 'redaction') {
          await createAnnotation(index, { kind: tool, rect });
        } else if (tool === 'rectangle' || tool === 'ellipse') {
          await createAnnotation(index, {
            kind: tool,
            rect,
            color: style.color,
            fill: style.fill,
            width: style.width,
          });
        }
        return;
      }
      case 'line': {
        if (Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < 3) return;
        const kind = tool === 'arrow' ? 'arrow' : 'line';
        await createAnnotation(index, { kind, a: g.start, b: p, color: style.color, width: style.width });
        return;
      }
      case 'ink':
        if (g.points.length < 2) return;
        await createAnnotation(index, {
          kind: 'ink',
          strokes: [g.points],
          color: style.color,
          width: style.width,
          opacity: style.opacity,
        });
        return;
      case 'markup': {
        const quads = await selectionQuads(index, g.start, p);
        if (quads.length === 0) return;
        const kind = tool as 'highlight' | 'underline' | 'strikeout';
        await createAnnotation(index, { kind, quads, color: style.color });
        return;
      }
      case 'move':
        await moveAnnotation(index, g.annot.id, p[0] - g.start[0], p[1] - g.start[1]);
        return;
      case 'resize': {
        const rect = resized(g.annot.rect, g.handle, p[0] - g.start[0], p[1] - g.start[1]);
        if (!tiny(rect, 2)) await updateAnnotation(index, g.annot.id, { rect });
      }
    }
  };

  // Starting a move or resize from a hit box / handle (Select tool).
  const beginMove = (e: ReactPointerEvent, annot: AnnotationInfo) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectAnnotation(index, annot.id);
    if (!annot.movable) return;
    layerRef.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'move', annot, start: toPage(e) };
  };
  const beginResize = (e: ReactPointerEvent, annot: AnnotationInfo, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    layerRef.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'resize', annot, handle, start: toPage(e) };
  };

  const onDoubleClick = (annot: AnnotationInfo) => {
    if (annot.kind === 'textbox') setTextbox({ id: annot.id, rect: annot.rect, contents: annot.contents });
    else if (annot.kind === 'note') openNoteEditor(index, annot);
  };

  // ---------- Rendering ----------

  const box = (r: Rect) => ({
    left: r[0] * s,
    top: r[1] * s,
    width: (r[2] - r[0]) * s,
    height: (r[3] - r[1]) * s,
  });

  return (
    <div
      ref={layerRef}
      className={styles.layer}
      data-tool={tool}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => void onPointerUp(e)}
      onDoubleClick={(e) => {
        // Handled here, not on the hit box: pointer capture during a drag retargets clicks to the layer.
        if (tool !== 'select' || !annots) return;
        const [x, y] = toPage(e);
        const hit = [...annots]
          .reverse()
          .find((a) => x >= a.rect[0] && x <= a.rect[2] && y >= a.rect[1] && y <= a.rect[3]);
        if (hit) onDoubleClick(hit);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setDraft(null);
      }}
    >
      {tool === 'select' &&
        annots?.map((a) => (
          <div
            key={a.id}
            className={styles.hit}
            data-movable={a.movable || undefined}
            style={box(a.rect)}
            role="button"
            tabIndex={0}
            aria-label={`${a.kind}${a.contents ? `: ${a.contents}` : ''}`}
            aria-pressed={a.id === selected}
            onPointerDown={(e) => beginMove(e, a)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onDoubleClick(a);
            }}
            onFocus={() => selectAnnotation(index, a.id)}
          />
        ))}

      {tool === 'select' && selectedAnnot && !textbox && (
        <div className={styles.selection} style={box(selectedAnnot.rect)} aria-hidden>
          {selectedAnnot.resizable &&
            HANDLES.map((h) => (
              <span
                key={h}
                className={styles.handle}
                data-handle={h}
                onPointerDown={(e) => beginResize(e, selectedAnnot, h)}
              />
            ))}
        </div>
      )}

      {draft && (
        <svg
          className={styles.preview}
          viewBox={`0 0 ${page.width} ${page.height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {draft.kind === 'rect' && <DraftRect rect={draft.rect} tool={tool} color={rgbCss(style.color)} />}
          {draft.kind === 'ghost' && (
            <rect
              className={styles.ghost}
              x={draft.rect[0]}
              y={draft.rect[1]}
              width={draft.rect[2] - draft.rect[0]}
              height={draft.rect[3] - draft.rect[1]}
            />
          )}
          {draft.kind === 'line' && (
            <line
              x1={draft.a[0]}
              y1={draft.a[1]}
              x2={draft.b[0]}
              y2={draft.b[1]}
              stroke={rgbCss(style.color)}
              strokeWidth={style.width}
              strokeLinecap="round"
            />
          )}
          {draft.kind === 'ink' && (
            <polyline
              points={draft.points.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={rgbCss(style.color)}
              strokeWidth={style.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {draft.kind === 'quads' &&
            draft.quads.map((q, i) => (
              <polygon
                key={i}
                points={`${q[0]},${q[1]} ${q[2]},${q[3]} ${q[6]},${q[7]} ${q[4]},${q[5]}`}
                fill={rgbCss(style.color)}
                opacity={0.4}
              />
            ))}
        </svg>
      )}

      {textbox && (
        <TextboxEditor
          draft={textbox}
          zoom={zoom}
          onDone={async (contents) => {
            const draftNow = textbox;
            setTextbox(null);
            if (draftNow.id) {
              if (contents !== draftNow.contents) await updateAnnotation(index, draftNow.id, { contents });
            } else if (contents.trim()) {
              const st = useApp.getState().styles.textbox;
              await createAnnotation(index, {
                kind: 'textbox',
                rect: draftNow.rect,
                contents,
                color: st.color,
                fontSize: st.fontSize,
                font: st.font,
              });
            }
          }}
          onCancel={() => setTextbox(null)}
          existing={annots?.find((a) => a.id === textbox.id) ?? null}
        />
      )}
    </div>
  );
}

function DraftRect({ rect, tool, color }: { rect: Rect; tool: Tool; color: string }) {
  const [x0, y0, x1, y1] = rect;
  const common = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  if (tool === 'ellipse') {
    return (
      <ellipse
        cx={(x0 + x1) / 2}
        cy={(y0 + y1) / 2}
        rx={(x1 - x0) / 2}
        ry={(y1 - y0) / 2}
        fill="none"
        stroke={color}
      />
    );
  }
  if (tool === 'whiteout') return <rect {...common} fill="#fff" stroke="#999" strokeDasharray="3 2" />;
  if (tool === 'redaction') return <rect {...common} fill="rgb(220 0 0 / 0.12)" stroke="rgb(200 0 0)" />;
  if (tool === 'rectangle') return <rect {...common} fill="none" stroke={color} />;
  return <rect {...common} className={styles.ghost} />;
}

function TextboxEditor({
  draft,
  zoom,
  existing,
  onDone,
  onCancel,
}: {
  draft: TextboxDraft;
  zoom: number;
  existing: AnnotationInfo | null;
  onDone: (contents: string) => void;
  onCancel: () => void;
}) {
  const st = useApp((s) => s.styles.textbox);
  const [value, setValue] = useState(draft.contents);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const s = cssScale(zoom);
  const [x0, y0, x1, y1] = draft.rect;
  const font = existing?.font ?? st.font;
  const size = existing?.fontSize ?? st.fontSize;
  const color = existing?.color ?? st.color;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onDone(value);
    else onCancel();
  };

  return (
    <textarea
      ref={ref}
      className={styles.textbox}
      style={{
        left: x0 * s,
        top: y0 * s,
        width: (x1 - x0) * s,
        minHeight: (y1 - y0) * s,
        font: cssFont({ family: font, bold: false, italic: false }, size * s),
        color: rgbCss(color),
      }}
      value={value}
      placeholder="Type here"
      aria-label="Text box"
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true);
      }}
      onBlur={() => finish(true)}
    />
  );
}
