// Поля даты, времени и длительности: не зависят от локали браузера, раскрываются внутри карточки.
import { useState } from 'react';
import Icon from '../icons.jsx';
import { cx } from '../lib.js';
import { todayStr, addDays, parseDate, pad, MONTHS, WD_SHORT, weekday, fmtDate, fmtDur, diffDays } from '../../shared/dates.js';

function dateLabel(v) {
  if (!v) return 'Без даты';
  const n = diffDays(todayStr(), v);
  if (n === 0) return 'Сегодня';
  if (n === 1) return 'Завтра';
  if (n === -1) return 'Вчера';
  return fmtDate(v, { weekday: true });
}

export function Calendar({ value, onPick, allowEmpty = true }) {
  const today = todayStr();
  const [ym, setYm] = useState((value || today).slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const lead = weekday(first) - 1;
  const n = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(`${ym}-${pad(d)}`);
  const shift = (k) => {
    const dt = new Date(y, m - 1 + k, 1);
    setYm(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`);
  };
  return (
    <div className="cal">
      <div className="cal-quick">
        <button type="button" className={cx('chip', value === today && 'on')} onClick={() => onPick(today)}>Сегодня</button>
        <button type="button" className={cx('chip', value === addDays(today, 1) && 'on')} onClick={() => onPick(addDays(today, 1))}>Завтра</button>
        <button type="button" className="chip" onClick={() => onPick(addDays(today, 8 - weekday(today)))}>Пн</button>
        {allowEmpty ? <button type="button" className={cx('chip', !value && 'on')} onClick={() => onPick(null)}>Без даты</button> : null}
      </div>
      <div className="cal-head">
        <button type="button" className="icon-btn sm" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><Icon name="left" size={16} /></button>
        <span>{MONTHS[m - 1]} {y}</span>
        <button type="button" className="icon-btn sm" onClick={() => shift(1)} aria-label="Следующий месяц"><Icon name="right" size={16} /></button>
      </div>
      <div className="cal-grid">
        {WD_SHORT.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d, i) => d ? (
          <button type="button" key={d} className={cx('cal-day', d === value && 'on', d === today && 'today', weekday(d) > 5 && 'we')} onClick={() => onPick(d)}>
            {parseDate(d).getDate()}
          </button>
        ) : <div key={'e' + i} />)}
      </div>
    </div>
  );
}

export function DateField({ value, onChange, allowEmpty = true, label = 'Дата' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('picker', open && 'open')}>
      <button type="button" className="picker-btn" onClick={() => setOpen(!open)}>
        <Icon name="plans" size={17} />
        <span className="picker-label">{label}</span>
        <span className="picker-value">{dateLabel(value)}</span>
        <Icon name="down" size={15} className="chev" />
      </button>
      {open ? <Calendar value={value} allowEmpty={allowEmpty} onPick={(d) => { onChange(d); setOpen(false); }} /> : null}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS = Array.from({ length: 12 }, (_, i) => i * 5);

export function TimeField({ value, onChange, label = 'Время', allowEmpty = true }) {
  const [open, setOpen] = useState(false);
  const [h, mm] = value ? value.split(':').map(Number) : [null, null];
  const setH = (x) => onChange(`${pad(x)}:${pad(mm ?? 0)}`);
  const setM = (x) => { onChange(`${pad(h ?? 9)}:${pad(x)}`); setOpen(false); };
  return (
    <div className={cx('picker', open && 'open')}>
      <button type="button" className="picker-btn" onClick={() => setOpen(!open)}>
        <Icon name="clock" size={17} />
        <span className="picker-label">{label}</span>
        <span className="picker-value">{value || 'Без времени'}</span>
        <Icon name="down" size={15} className="chev" />
      </button>
      {open ? (
        <div className="timepick">
          <div className="tp-label">Часы</div>
          <div className="tp-grid hours">
            {HOURS.map((x) => <button type="button" key={x} className={cx('tp', h === x && 'on', (x < 7 || x > 22) && 'dim')} onClick={() => setH(x)}>{pad(x)}</button>)}
          </div>
          <div className="tp-label">Минуты</div>
          <div className="tp-grid mins">
            {MINS.map((x) => <button type="button" key={x} className={cx('tp', mm === x && 'on')} onClick={() => setM(x)}>:{pad(x)}</button>)}
          </div>
          <div className="tp-actions">
            {allowEmpty ? <button type="button" className="btn ghost sm" onClick={() => { onChange(null); setOpen(false); }}>Без времени</button> : null}
            <button type="button" className="btn soft sm" onClick={() => setOpen(false)}>Готово</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const DURS = [15, 30, 45, 60, 90, 120, 180];

export function DurationField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  return (
    <div className={cx('picker', open && 'open')}>
      <button type="button" className="picker-btn" onClick={() => setOpen(!open)}>
        <Icon name="timer" size={17} />
        <span className="picker-label">Длительность</span>
        <span className="picker-value">{value ? fmtDur(value) : 'Не задана'}</span>
        <Icon name="down" size={15} className="chev" />
      </button>
      {open ? (
        <div className="durpick">
          <div className="chips">
            {DURS.map((d) => <button type="button" key={d} className={cx('chip', value === d && 'on')} onClick={() => { onChange(d); setOpen(false); }}>{fmtDur(d)}</button>)}
            <button type="button" className={cx('chip', !value && 'on')} onClick={() => { onChange(null); setOpen(false); }}>Не задана</button>
          </div>
          <div className="row gap">
            <input className="input" inputMode="numeric" placeholder="Своё, мин" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            <button type="button" className="btn soft" disabled={!Number(custom)} onClick={() => { onChange(Number(custom)); setCustom(''); setOpen(false); }}>OK</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Простое поле времени для настроек (HH:MM), со своей разметкой — без input[type=time]
export function TimeInput({ value, onChange }) {
  const [v, setV] = useState(value || '');
  const commit = () => {
    const m = v.replace(/[^\d]/g, '');
    let h, mi;
    if (m.length <= 2) { h = Number(m); mi = 0; } else { h = Number(m.slice(0, m.length - 2)); mi = Number(m.slice(-2)); }
    if (Number.isNaN(h) || h > 23 || mi > 59 || !m) { setV(value || ''); return; }
    const out = `${pad(h)}:${pad(mi)}`;
    setV(out);
    onChange(out);
  };
  return (
    <input className="input time-input" inputMode="numeric" value={v} maxLength={5} placeholder="09:00"
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}
