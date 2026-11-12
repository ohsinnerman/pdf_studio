import { useState } from 'react';
import type { FieldInfo, PageInfo } from '../../engine/api.ts';
import { cssScale } from '../../lib/coords.ts';
import { setFieldValue, useFields } from '../../state/annotations.ts';
import styles from './FieldLayer.module.css';

interface Props {
  readonly docId: string;
  readonly page: PageInfo;
  readonly index: number;
  readonly zoom: number;
}

/**
 * Fill-in controls over a page's form fields. The engine draws each field's
 * real appearance; the controls here are see-through until focused, so what
 * you see is what the PDF will show.
 */
export function FieldLayer({ docId, page, index, zoom }: Props) {
  const fields = useFields(docId, page, index);
  const s = cssScale(zoom);
  if (!fields || fields.length === 0) return null;

  return (
    <div className={styles.layer}>
      {fields.map((f) => {
        const [x0, y0, x1, y1] = f.rect;
        const box = { left: x0 * s, top: y0 * s, width: (x1 - x0) * s, height: (y1 - y0) * s };
        return (
          <Field
            key={`${f.id}:${f.value}:${f.checked}`}
            field={f}
            index={index}
            box={box}
            fontPx={Math.max(9, (y1 - y0) * s * 0.6)}
          />
        );
      })}
    </div>
  );
}

function Field({
  field: f,
  index,
  box,
  fontPx,
}: {
  field: FieldInfo;
  index: number;
  box: React.CSSProperties;
  fontPx: number;
}) {
  const [value, setValue] = useState(f.value);
  const label = f.label || f.name;
  const commit = (v: string | boolean) => void setFieldValue(index, f.id, v);
  const common = {
    className: styles.field,
    style: { ...box, fontSize: fontPx },
    title: label + (f.readOnly ? ' (read-only)' : ''),
    'aria-label': label,
    disabled: f.readOnly,
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };

  switch (f.kind) {
    case 'text':
      return f.multiline ? (
        <textarea
          {...common}
          value={value}
          maxLength={f.maxLength || undefined}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== f.value && commit(value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          value={value}
          maxLength={f.maxLength || undefined}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== f.value && commit(value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      );
    case 'checkbox':
    case 'radio':
      return (
        <button
          {...common}
          type="button"
          role={f.kind}
          aria-checked={f.checked}
          data-toggle
          onClick={() => commit(!f.checked)}
        />
      );
    case 'choice':
      return (
        <select {...common} value={value} onChange={(e) => commit(e.target.value)}>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    default:
      return null; // buttons and signature fields: not fillable here yet
  }
}
