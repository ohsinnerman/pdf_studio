import { useEffect, useRef, useState } from 'react';
import type { PageInfo, TextLine } from '../../engine/api.ts';
import { cssScale } from '../../lib/coords.ts';
import { cancelTextEdit, commitTextEdit, startTextEdit } from '../../state/actions.ts';
import { useApp } from '../../state/store.ts';
import { cssFont, measureText, rgbCss, substituteLabel } from './fonts.ts';
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

function LineEditor({ line, zoom }: { readonly line: TextLine; readonly zoom: number }) {
  const [text, setText] = useState(line.text);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const s = cssScale(zoom);
  const [x0, y0, x1, y1] = line.bbox;
  const fontPx = line.size * s;
  const font = cssFont(line.font, fontPx);
  // Grow with the text, never narrower than the original line.
  const width = Math.max((x1 - x0) * s, measureText(text, font) + fontPx * 0.5);

  useEffect(() => {
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, []);

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await commitTextEdit(text);
    setSaving(false);
    // Refused (e.g. a character the font can't draw): keep the editor open so it can be fixed.
    if (!ok) inputRef.current?.focus();
  };

  return (
    <div className={styles.editor} style={{ left: x0 * s, top: y0 * s }}>
      <input
        ref={inputRef}
        className={styles.input}
        style={{ width, height: (y1 - y0) * s, font, color: rgbCss(line.color) }}
        value={text}
        spellCheck
        aria-label="Edit line of text"
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // don't trigger app shortcuts (Delete, Ctrl+Z…) while typing
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') cancelTextEdit();
        }}
        onBlur={() => void commit()}
      />
      <p
        className={styles.chip}
        title="The original font can't be reused yet, so the edited line uses the closest standard font."
      >
        {substituteLabel(line.font)} · <span className="num">{Math.round(line.size * 10) / 10}</span> pt ·{' '}
        <kbd>Enter</kbd> to apply · <kbd>Esc</kbd> to cancel
      </p>
    </div>
  );
}
