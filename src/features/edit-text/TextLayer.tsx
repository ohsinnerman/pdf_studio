import { useEffect, useRef, useState } from 'react';
import type { PageInfo, TextLine, TextStyle } from '../../engine/api.ts';
import { cssScale } from '../../lib/coords.ts';
import { cancelTextEdit, commitTextEdit, startTextEdit } from '../../state/actions.ts';
import { useApp } from '../../state/store.ts';
import { cssFont, measureText, planFonts, rgbCss } from './fonts.ts';
import styles from './TextLayer.module.css';
import { useTextLines } from './useTextLines.ts';

interface TextLayerProps {
  readonly docId: string;
  readonly page: PageInfo;
  readonly index: number;
  readonly zoom: number;
}

/**
 * Edit text tool, drawn over one page: every line of existing text gets a
 * hover outline; clicking one opens an inline editor in its place.
 */
export function TextLayer({ docId, page, index, zoom }: TextLayerProps) {
  const lines = useTextLines(docId, page, index);
  const edit = useApp((s) => s.textEdit);
  const s = cssScale(zoom);
  const editing = edit && edit.pageKey === page.key && edit.docId === docId ? edit.line : null;

  return (
    <div className={styles.layer} aria-label={`Text on page ${index + 1}`}>
      {lines?.map((line, i) => {
        if (editing && sameLine(line, editing)) return null;
        const [x0, y0, x1, y1] = line.bbox;
        return (
          <button
            key={i}
            type="button"
            className={styles.line}
            data-editable={line.editable || undefined}
            style={{ left: x0 * s, top: y0 * s, width: (x1 - x0) * s, height: (y1 - y0) * s }}
            title={line.editable ? `Edit: ${line.text}` : "Rotated text can't be edited yet"}
            aria-label={`Edit text: ${line.text}`}
            onClick={() => startTextEdit(index, line)}
          />
        );
      })}
      {editing && <LineEditor key={`${page.revision}-${editing.bbox.join()}`} line={editing} zoom={zoom} />}
    </div>
  );
}

const sameLine = (a: TextLine, b: TextLine) => a.bbox.every((v, i) => Math.abs(v - b.bbox[i]!) < 0.01);

const SWATCHES: readonly (readonly [number, number, number])[] = [
  [0.1, 0.1, 0.1],
  [0.11, 0.33, 0.8],
  [0.8, 0.13, 0.13],
  [0.1, 0.55, 0.3],
];

function LineEditor({ line, zoom }: { readonly line: TextLine; readonly zoom: number }) {
  const [text, setText] = useState(line.text);
  const [style, setStyle] = useState<TextStyle>({});
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const s = cssScale(zoom);
  const [x0, y0, x1, y1] = line.bbox;
  const size = style.size ?? line.size;
  const look = {
    family: style.family ?? line.font.family,
    bold: style.bold ?? line.font.bold,
    italic: style.italic ?? line.font.italic,
  };
  const color = style.color ?? line.color;
  const restyled =
    look.bold !== line.font.bold || look.italic !== line.font.italic || look.family !== line.font.family;
  const fontPx = size * s;
  const font = cssFont(look, fontPx);
  // Grow with the text, never narrower than the original line.
  const width = Math.max((x1 - x0) * s, measureText(text, font) + fontPx * 0.5);
  // A restyled line can't use the original font, so plan as if it had none.
  const plan = planFonts({ font: { ...line.font, ...look }, glyphs: restyled ? '' : line.glyphs }, text);
  // Baseline stays put when the size changes: grow the box upwards.
  const top = (line.origin[1] - (line.origin[1] - y0) * (size / line.size)) * s;

  useEffect(() => {
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, []);

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    const changed = Object.fromEntries(
      Object.entries(style).filter(([k, v]) => {
        const original: Record<string, unknown> = { size: line.size, color: line.color, ...line.font };
        return JSON.stringify(v) !== JSON.stringify(original[k]);
      }),
    ) as TextStyle;
    const ok = await commitTextEdit(text, changed);
    setSaving(false);
    // Refused (e.g. a character the font can't draw): keep the editor open so it can be fixed.
    if (!ok) inputRef.current?.focus();
  };

  // Toolbar buttons must not steal focus from the input (that would apply the edit).
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const sizeStep = (d: number) =>
    setStyle((st) => ({ ...st, size: Math.max(4, Math.round((size + d) * 2) / 2) }));

  return (
    <div
      ref={containerRef}
      className={styles.editor}
      style={{ left: x0 * s, top }}
      // Apply when focus leaves the editor entirely, not when it moves to its own controls.
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) void commit();
      }}
    >
      <input
        ref={inputRef}
        className={styles.input}
        style={{ width, height: (y1 - y0) * s * (size / line.size), font, color: rgbCss(color) }}
        value={text}
        spellCheck
        aria-label="Edit line of text"
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // don't trigger app shortcuts (Delete, Ctrl+Z…) while typing
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') cancelTextEdit();
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            setStyle((st) => ({ ...st, bold: !look.bold }));
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            setStyle((st) => ({ ...st, italic: !look.italic }));
          }
        }}
      />
      <div className={styles.chip} data-problem={plan.problem ? true : undefined}>
        <span className={styles.controls} role="toolbar" aria-label="Text style">
          <button type="button" onMouseDown={keep} onClick={() => sizeStep(-1)} aria-label="Smaller">
            A−
          </button>
          <span className="num" aria-label="Font size">
            {Math.round(size * 10) / 10} pt
          </span>
          <button type="button" onMouseDown={keep} onClick={() => sizeStep(1)} aria-label="Bigger">
            A+
          </button>
          <button
            type="button"
            onMouseDown={keep}
            aria-pressed={look.bold}
            aria-label="Bold (Ctrl+B)"
            onClick={() => setStyle((st) => ({ ...st, bold: !look.bold }))}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            onMouseDown={keep}
            aria-pressed={look.italic}
            aria-label="Italic (Ctrl+I)"
            onClick={() => setStyle((st) => ({ ...st, italic: !look.italic }))}
          >
            <i>I</i>
          </button>
          <select
            aria-label="Font family"
            value={look.family}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              setStyle((st) => ({ ...st, family: e.target.value as TextStyle['family'] }));
              inputRef.current?.focus();
            }}
          >
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="mono">Mono</option>
          </select>
          {[
            line.color,
            ...SWATCHES.filter((c) => !c.every((v, k) => Math.abs(v - line.color[k]!) < 0.05)),
          ].map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={keep}
              className={styles.swatch}
              style={{ background: rgbCss(c) }}
              aria-label={i === 0 ? 'Original colour' : `Colour ${i}`}
              aria-pressed={c.every((v, k) => Math.abs(v - color[k]!) < 0.02)}
              onClick={() => setStyle((st) => ({ ...st, color: c }))}
            />
          ))}
        </span>
        <span role="status">{plan.problem ?? plan.label}</span>
        <span>
          <kbd>Enter</kbd> apply · <kbd>Esc</kbd> cancel
        </span>
      </div>
    </div>
  );
}
