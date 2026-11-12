import { Layers, ShieldCheck, Trash2 } from 'lucide-react';
import { IconButton } from '../../components/Button.tsx';
import { ToolbarDivider, ToolbarGroup, ToolbarSpacer } from '../../components/Toolbar.tsx';
import type { RGB } from '../../engine/api.ts';
import { setTool } from '../../state/actions.ts';
import {
  applyStyle,
  askToApplyRedactions,
  deleteSelectedAnnotation,
  flatten,
  useAnnotations,
} from '../../state/annotations.ts';
import { useApp } from '../../state/store.ts';
import { TOOL_GROUPS } from './tools.tsx';
import { rgbCss } from '../edit-text/fonts.ts';
import styles from './ToolsBar.module.css';

const PALETTE: readonly { name: string; rgb: RGB }[] = [
  { name: 'Black', rgb: [0.1, 0.1, 0.1] },
  { name: 'Blue', rgb: [0.11, 0.33, 0.8] },
  { name: 'Red', rgb: [0.8, 0.13, 0.13] },
  { name: 'Orange', rgb: [0.76, 0.25, 0.05] },
  { name: 'Green', rgb: [0.1, 0.55, 0.3] },
  { name: 'Yellow', rgb: [1, 0.86, 0.2] },
  { name: 'Pink', rgb: [0.95, 0.45, 0.65] },
];

const sameColor = (a: RGB | null | undefined, b: RGB) => !!a && a.every((v, i) => Math.abs(v - b[i]!) < 0.02);

/** Which properties a tool (or a selected annotation of that kind) has. */
function propsFor(kind: string) {
  return {
    color: !['select', 'editText', 'whiteout', 'redaction', 'image'].includes(kind),
    width: ['ink', 'rectangle', 'ellipse', 'line', 'arrow', 'signature'].includes(kind),
    fill: ['rectangle', 'ellipse'].includes(kind),
    text: kind === 'textbox',
  };
}

export function ToolsBar() {
  const doc = useApp((s) => s.doc);
  const tool = useApp((s) => s.tool);
  const style = useApp((s) => s.styles[s.tool]);
  const sel = useApp((s) => s.selectedAnnot);
  const page = sel && doc ? doc.info.pages[sel.pageIndex] : undefined;
  const annots = useAnnotationsFor(doc?.id ?? '', page, sel?.pageIndex ?? 0);
  const selected = annots?.find((a) => a.id === sel?.id) ?? null;

  // With an annotation selected, the controls show and change ITS style.
  const kind = selected ? (selected.kind === 'signature' ? 'ink' : selected.kind) : tool;
  const p = propsFor(kind);
  const color = selected ? selected.color : style.color;
  const fill = selected ? selected.fill : style.fill;
  const width = selected ? selected.width : style.width;
  const fontSize = selected?.fontSize ?? style.fontSize;
  const font = selected?.font ?? style.font;

  return (
    <div role="toolbar" aria-label="Tools" className={styles.bar}>
      {TOOL_GROUPS.map((group, i) => (
        <span key={i} className={styles.group}>
          {i > 0 && <ToolbarDivider />}
          <ToolbarGroup label={group[0]!.label}>
            {group.map((t) => (
              <IconButton
                key={t.tool}
                label={t.label}
                shortcut={t.key}
                icon={t.icon}
                pressed={tool === t.tool}
                disabled={!doc}
                onClick={() => setTool(t.tool)}
              />
            ))}
          </ToolbarGroup>
        </span>
      ))}

      <ToolbarSpacer />

      {doc && (
        <div
          className={styles.props}
          aria-label={selected ? 'Selected annotation' : 'Tool settings'}
          role="group"
        >
          {p.color && (
            <div className={styles.swatches} role="radiogroup" aria-label="Colour">
              {PALETTE.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={sameColor(color, c.rgb)}
                  aria-label={c.name}
                  title={c.name}
                  className={styles.swatch}
                  style={{ background: rgbCss(c.rgb) }}
                  onClick={() => void applyStyle({ color: c.rgb })}
                />
              ))}
            </div>
          )}
          {p.fill && (
            <label className={styles.field}>
              Fill
              <select
                value={fill ? 'tint' : 'none'}
                onChange={(e) =>
                  void applyStyle({
                    fill:
                      e.target.value === 'none'
                        ? null
                        : (color?.map((v) => 0.85 + v * 0.15) as unknown as RGB),
                  })
                }
              >
                <option value="none">None</option>
                <option value="tint">Light</option>
              </select>
            </label>
          )}
          {p.width && (
            <label className={styles.field}>
              Width
              <select
                value={String(width)}
                onChange={(e) => void applyStyle({ width: Number(e.target.value) })}
              >
                {[0.75, 1, 1.5, 2, 3, 5, 8].map((w) => (
                  <option key={w} value={w}>
                    {w} pt
                  </option>
                ))}
              </select>
            </label>
          )}
          {p.text && (
            <>
              <label className={styles.field}>
                Font
                <select value={font} onChange={(e) => void applyStyle({ font: e.target.value as 'sans' })}>
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </label>
              <label className={styles.field}>
                Size
                <select
                  value={String(fontSize)}
                  onChange={(e) => void applyStyle({ fontSize: Number(e.target.value) })}
                >
                  {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {selected && (
            <IconButton
              label="Delete annotation"
              shortcut="Delete"
              icon={<Trash2 />}
              onClick={() => void deleteSelectedAnnotation()}
            />
          )}
          {tool === 'redaction' && (
            <button type="button" className={styles.action} onClick={askToApplyRedactions}>
              <ShieldCheck aria-hidden /> Apply redactions
            </button>
          )}
          {tool === 'select' && !selected && (
            <IconButton
              label="Flatten all annotations and form fields"
              icon={<Layers />}
              onClick={() => void flatten()}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** useAnnotations needs a page; this keeps the hook call unconditional. */
function useAnnotationsFor(
  docId: string,
  page: Parameters<typeof useAnnotations>[1] | undefined,
  index: number,
) {
  const fallback = { key: -1, revision: -1, width: 1, height: 1, rotation: 0 as const };
  const data = useAnnotations(docId, page ?? fallback, index);
  return page ? data : null;
}
