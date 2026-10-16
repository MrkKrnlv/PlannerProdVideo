// Поиск (Ctrl+K), онбординг, тост
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { useData } from '../store.js';
import { useUI } from '../ui.js';
import { cx, itemsOf } from '../lib.js';
import { relDay } from '../../shared/dates.js';
import { api } from '../sync.js';

export function Search() {
  const setSearch = useUI((s) => s.setSearch);
  const { open, go, setDate } = useUI.getState();
  const tasks = useData((s) => s.tasks);
  const items = useData((s) => s.items);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const r = [];
    for (const t of Object.values(tasks)) {
      if (t.deleted) continue;
      if ((t.title || '').toLowerCase().includes(s) || (t.note || '').toLowerCase().includes(s) || (t.area || '') === s.replace('#', '')) {
        r.push({ k: 'task', id: t.id, title: t.title, sub: t.date ? relDay(t.date) + (t.time ? ', ' + t.time : '') : 'Входящие', done: t.done, sort: t.done ? 1 : 0 });
      }
    }
    for (const n of itemsOf(items, 'note')) {
      if ((n.data.title || '').toLowerCase().includes(s) || (n.data.text || '').toLowerCase().includes(s)) r.push({ k: 'note', id: n.id, title: n.data.title || (n.data.text || '').slice(0, 60), sub: 'Заметка', sort: 2 });
    }
    for (const h of itemsOf(items, 'habit')) {
      if (h.data.name.toLowerCase().includes(s)) r.push({ k: 'habit', id: h.id, title: h.data.name, sub: 'Привычка', sort: 3 });
    }
    return r.sort((a, b) => a.sort - b.sort).slice(0, 30);
  }, [q, tasks, items]);
  const pick = (r) => {
    setSearch(false);
    if (r.k === 'task') {
      const t = tasks[r.id];
      if (t.date) { setDate(t.date); go('today'); } else go('plans', 'inbox');
      open('task', { id: r.id });
    } else if (r.k === 'note') { go('more', 'notes'); open('note', { id: r.id }); } else { go('growth', 'habits'); open('habit', { id: r.id }); }
  };
  return (
    <div className="search-wrap" onClick={() => setSearch(false)}>
      <div className="search glass-strong" onClick={(e) => e.stopPropagation()}>
        <div className="search-in">
          <Icon name="search" />
          <input autoFocus value={q} placeholder="Поиск задач, заметок, привычек" onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)); }
              if (e.key === 'Enter' && results[sel]) pick(results[sel]);
              if (e.key === 'Escape') setSearch(false);
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="search-res">
          {q && !results.length ? <div className="search-empty">Ничего не найдено</div> : null}
          {!q ? <div className="search-empty">Начни вводить — ищу по названиям, заметкам и #сферам</div> : null}
          {results.map((r, i) => (
            <button key={r.k + r.id} className={cx('search-row', i === sel && 'on', r.done && 'done')} onClick={() => pick(r)} onMouseEnter={() => setSel(i)}>
              <Icon name={r.k === 'task' ? 'check' : r.k === 'note' ? 'note' : 'flame'} size={17} />
              <span className="grow">{r.title}</span>
              <span className="muted sm">{r.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: 'today', title: 'План дня без лишнего', text: 'Сегодняшние задачи, главное дело, привычки и свободные окна — на одном экране. Всё работает офлайн и сразу сохраняется.' },
  { icon: 'spark', title: 'Пиши как говоришь', text: 'Быстрый ввод понимает время, длительность и дату:', example: 'созвон 1.5ч в 16:00 завтра #работа !' },
  { icon: 'mic', title: 'Голосом через бота', text: 'Отправь боту голосовое — «завтра в десять встреча, потом отчёт на два часа» — задачи появятся в планере.' },
  { icon: 'sync', title: 'Телефон и компьютер', text: '' },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const setLocal = useData((s) => s.setLocal);
  const setAuth = useData((s) => s.setAuth);
  const auth = useData((s) => s.auth);
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const done = () => setLocal({ onboarded: true });
  const s = STEPS[i];
  const connect = async () => {
    setErr('');
    try {
      const me = await api('/api/me', { key: key.trim() });
      setAuth({ key: me.key, user: me.user });
      done();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="onb-wrap">
      <div className="onb glass-strong">
        <div className="onb-dots">{STEPS.map((_, k) => <span key={k} className={cx(k === i && 'on')} />)}</div>
        <div className="onb-ic"><Icon name={s.icon} size={30} /></div>
        <h2>{s.title}</h2>
        {s.text ? <p>{s.text}</p> : null}
        {s.example ? <div className="onb-example">{s.example}<div className="quick-chips"><span className="pchip date">завтра</span><span className="pchip time">16:00</span><span className="pchip dur">1 ч 30 мин</span><span className="pchip area">#работа</span><span className="pchip prio">важно</span></div></div> : null}
        {i === 3 ? (
          auth.key ? <p>Ты вошёл через Telegram — данные уже синхронизируются. Чтобы открыть планер в браузере, скопируй ключ в «Ещё → Настройки».</p> : (
            <div className="onb-key">
              <p>Открой планер в Telegram → «Ещё → Настройки» → скопируй ключ и вставь сюда. Можно и позже.</p>
              <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="pk_…" />
              {err ? <div className="err">{err}</div> : null}
            </div>
          )
        ) : null}
        <div className="onb-actions">
          {i < 3 ? <button className="btn ghost" onClick={done}>Пропустить</button> : <span />}
          {i < 3 ? <button className="btn primary" onClick={() => setI(i + 1)}>Дальше<Icon name="arrow" size={18} /></button> : (
            key.trim() && !auth.key ? <button className="btn primary" onClick={connect}>Подключить</button> : <button className="btn primary" onClick={done}>{auth.key ? 'Начать' : 'Начать без синхронизации'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const t = useUI((s) => s.toast);
  if (!t) return null;
  return (
    <div className="toast glass-strong" key={t.id} role="status">
      <span className="grow">{t.text}</span>
      {t.action ? <button className="btn ghost sm" onClick={() => { t.action.run(); useUI.setState({ toast: null }); }}>{t.action.label}</button> : null}
    </div>
  );
}

export function useHotkeys() {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        useUI.getState().setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return ref;
}
