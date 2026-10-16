// Базовые элементы интерфейса
import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { cx } from '../lib.js';
import { useUI } from '../ui.js';
import { tgApp } from '../telegram.js';

export function Sheet({ title, onClose, children, footer, wide = false, className = '' }) {
  const close = onClose || (() => useUI.getState().close());
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    document.documentElement.classList.add('lock');
    const wa = tgApp();
    let back = null;
    if (wa?.BackButton && wa.isVersionAtLeast?.('6.1')) {
      back = () => close();
      wa.BackButton.show();
      wa.BackButton.onClick(back);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('lock');
      if (back && wa) { wa.BackButton.offClick(back); wa.BackButton.hide(); }
    };
  }, []);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true">
      <div className="sheet-backdrop" onClick={close} />
      <div className={cx('sheet glass-strong', wide && 'wide', className)} ref={ref}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Закрыть"><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options, small = false, className = '' }) {
  return (
    <div className={cx('seg', small && 'small', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={cx(value === o.value && 'on')} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={16} /> : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, max = 1, tone = 'auto', marker, label }) {
  const r = max ? value / max : 0;
  const t = tone === 'auto' ? (r > 1 ? 'bad' : r > 0.85 ? 'warn' : 'good') : tone;
  return (
    <div className={cx('bar', t)} aria-label={label}>
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, r * 100))}%` }} />
      {marker != null ? <div className="bar-marker" style={{ left: `${Math.min(100, marker * 100)}%` }} /> : null}
    </div>
  );
}

export function Check({ checked, onChange, frog, size = 24, label = 'Готово' }) {
  return (
    <button
      type="button"
      className={cx('check', checked && 'on', frog && 'frog')}
      style={{ width: size, height: size }}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      aria-pressed={checked}
      aria-label={label}
    >
      {checked ? <Icon name="check" size={size * 0.62} stroke={2.6} /> : null}
    </button>
  );
}

export function Empty({ icon = 'spark', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={22} /></div>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {action || null}
    </div>
  );
}

export function Section({ title, right, children, className = '', count }) {
  return (
    <section className={cx('section', className)}>
      {title ? (
        <div className="section-head">
          <h3>{title}{count != null ? <span className="count">{count}</span> : null}</h3>
          {right || null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, icon, tone }) {
  return (
    <button type="button" className={cx('toggle-row', checked && 'on', tone)} onClick={() => onChange(!checked)} aria-pressed={checked}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span className="grow">{label}</span>
      <span className="switch"><span /></span>
    </button>
  );
}

export function Chip({ children, on, onClick, tone, icon, className = '' }) {
  return (
    <button type="button" className={cx('chip', on && 'on', tone, className)} onClick={onClick}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

export function AutoText({ value, onChange, placeholder, className = '', minRows = 1, autoFocus, onKeyDown }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea ref={ref} className={cx('input autotext', className)} rows={minRows} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} onKeyDown={onKeyDown} />
  );
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function PageHead({ title, sub, right, back, below }) {
  return (
    <header className="page-head glass">
      <div className="page-head-in">
        {back ? <button className="icon-btn" onClick={back} aria-label="Назад"><Icon name="left" /></button> : null}
        <div className="page-title">
          <h1>{title}</h1>
          {sub ? <div className="page-sub">{sub}</div> : null}
        </div>
        <div className="page-actions">{right}</div>
      </div>
      {below ? <div className="page-below">{below}</div> : null}
    </header>
  );
}
