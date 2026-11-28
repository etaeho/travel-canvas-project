import type { ReactNode } from 'react';
import { limitLabel } from '../lib/format';

export function Chips(props: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { label, options, selected, onChange } = props;
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            className={on ? 'chip on' : 'chip'}
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
          >
            {on ? '✓ ' : ''}
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** A limit in minutes. '' in the select stands for "no limit". */
export function LimitSelect(props: {
  id: string;
  value: number | null;
  choices: number[];
  onChange: (v: number | null) => void;
}) {
  const { id, value, choices, onChange } = props;
  const all = value !== null && !choices.includes(value) ? [...choices, value].sort((a, b) => a - b) : choices;
  return (
    <select
      id={id}
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      {all.map((c) => (
        <option key={c} value={c}>
          {limitLabel(c)}
        </option>
      ))}
      <option value="">{limitLabel(null)}</option>
    </select>
  );
}

export function YesNo(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { label, value, onChange } = props;
  return (
    <div className="seg" role="group" aria-label={label}>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          className={value === v ? 'segbtn on' : 'segbtn'}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {v ? '예' : '아니요'}
        </button>
      ))}
    </div>
  );
}

export function Row(props: { label: ReactNode; htmlFor?: string; hint?: string; children: ReactNode }) {
  const { label, htmlFor, hint, children } = props;
  return (
    <div className="row">
      <div className="row-main">
        {htmlFor ? (
          <label className="row-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="row-label">{label}</span>
        )}
        <div className="row-control">{children}</div>
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Tag(props: { tone: 'good' | 'bad' | 'info' | 'idle'; children: ReactNode }) {
  return <span className={`tag t-${props.tone}`}>{props.children}</span>;
}
