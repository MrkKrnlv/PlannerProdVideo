// Ещё: Таймеры, Заметки, Экспорт, Импорт, Настройки
import { useEffect, useMemo, useState } from 'react';
import Icon from '../icons.jsx';
import { useData, useSettings } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, itemsOf, copyText, download, liveTasks, tasksWord } from '../lib.js';
import { Section, Empty, Segmented, PageHead, Field, Chip } from '../components/ui.jsx';
import { TimeInput } from '../components/pickers.jsx';
import { useTimers, timeLeft, fmtClock } from '../timers.js';
import { buildExport, exportPrompt, normalizeImport } from '../../shared/transfer.js';
import { todayStr, MONTHS, pad, fmtDate } from '../../shared/dates.js';
import { habitLogId } from '../../shared/planning.js';
import { api, syncNow, useSync } from '../sync.js';
import { tgApp } from '../telegram.js';

const MENU = [
  { id: 'timers', icon: 'timer', title: 'Таймеры', text: 'Фокус 25/50 и побочные таймеры' },
  { id: 'notes', icon: 'note', title: 'Заметки', text: 'Мысли и идеи с поиском' },
  { id: 'export', icon: 'spark', title: 'Экспорт для Claude', text: 'Промпт на разбор месяца + JSON' },
  { id: 'import', icon: 'upload', title: 'Импорт JSON', text: 'Задачи и привычки из файла' },
  { id: 'settings', icon: 'settings', title: 'Настройки', text: 'Тема, мои часы, бот, Notion, ключ' },
];

export default function More() {
  const sub = useUI((s) => s.sub);
  const go = useUI((s) => s.go);
  const item = MENU.find((m) => m.id === sub);
  const back = () => go('more', '');
  useEffect(() => {
    const wa = tgApp();
    if (!item || !wa?.BackButton || !wa.isVersionAtLeast?.('6.1')) return undefined;
    wa.BackButton.show();
    wa.BackButton.onClick(back);
    return () => { wa.BackButton.offClick(back); wa.BackButton.hide(); };
  }, [sub]);
  if (!item) {
    return (
      <div className="screen more">
        <PageHead title="Ещё" />
        <div className="content">
          <div className="menu card">
            {MENU.map((m) => (
              <button key={m.id} className="menu-row" onClick={() => go('more', m.id)}>
                <span className="menu-ic"><Icon name={m.icon} size={19} /></span>
                <span className="grow"><b>{m.title}</b><span className="muted sm">{m.text}</span></span>
                <Icon name="right" size={16} className="muted" />
              </button>
            ))}
          </div>
          <SyncBadge />
        </div>
      </div>
    );
  }
  return (
    <div className="screen more">
      <PageHead title={item.title} back={back} />
      <div className="content">
        {sub === 'timers' ? <Timers /> : sub === 'notes' ? <Notes /> : sub === 'export' ? <Export /> : sub === 'import' ? <Import /> : <Settings />}
      </div>
    </div>
  );
}

function SyncBadge() {
  const key = useData((s) => s.auth.key);
  const sync = useSync();
  if (!key) return <div className="hint center">Локальный режим: данные только на этом устройстве. Подключи синхронизацию в настройках.</div>;
  return <div className="hint center">Синхронизация: {sync.status === 'ok' ? `ок, ${new Date(sync.last).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : sync.status === 'error' ? sync.error : sync.status === 'offline' ? 'нет сети' : '…'}</div>;
}

// ——— Таймеры ———
function useTick(active) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

export function TimerWatcher() {
  const list = useTimers((s) => s.list);
  const finish = useTimers((s) => s.finish);
  const running = list.some((t) => t.running);
  useTick(running);
  useEffect(() => {
    for (const t of list) {
      if (t.running && timeLeft(t) <= 0) {
        finish(t.id);
        toast(`Таймер «${t.name}» завершён`, null, 6000);
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
      }
    }
  });
  return null;
}

export function FocusPill() {
  const t = useTimers((s) => s.list.find((x) => x.kind === 'focus' && x.running));
  const go = useUI((s) => s.go);
  const tab = useUI((s) => s.tab);
  const sub = useUI((s) => s.sub);
  useTick(!!t);
  if (!t || (tab === 'more' && sub === 'timers')) return null;
  return (
    <button className="focus-pill glass-strong" onClick={() => go('more', 'timers')}>
      <Icon name="target" size={16} /><span className="tnum">{fmtClock(timeLeft(t))}</span><span className="fp-name">{t.name}</span>
    </button>
  );
}

function Timers() {
  const { list, start, pause, resume, reset, remove } = useTimers();
  const toggleTask = useData((s) => s.toggleTask);
  const [name, setName] = useState('');
  const [min, setMin] = useState(10);
  useTick(list.some((t) => t.running));
  const focus = list.find((t) => t.kind === 'focus');
  const side = list.filter((t) => t.kind !== 'focus');
  const left = focus ? timeLeft(focus) : 25 * 60;
  const frac = focus ? 1 - left / focus.total : 0;
  const R = 92;
  const C = 2 * Math.PI * R;
  return (
    <>
      <div className="card focus">
        <div className="ring">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r={R} className="ring-bg" />
            <circle cx="110" cy="110" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
          </svg>
          <div className="ring-in">
            <b className="tnum">{fmtClock(left)}</b>
            <span>{focus ? (focus.finished ? 'Готово' : focus.running ? 'Фокус' : 'Пауза') : 'Готов к фокусу'}</span>
          </div>
        </div>
        {focus ? <div className="focus-name">{focus.name}</div> : null}
        <div className="row gap center wrap">
          {!focus || focus.finished ? (
            <>
              <button className="btn primary" onClick={() => start({ kind: 'focus', minutes: 25, name: focus?.name || 'Фокус', taskId: focus?.taskId })}><Icon name="play" size={18} />25 мин</button>
              <button className="btn soft" onClick={() => start({ kind: 'focus', minutes: 50, name: focus?.name || 'Фокус', taskId: focus?.taskId })}><Icon name="play" size={18} />50 мин</button>
            </>
          ) : (
            <>
              {focus.running ? <button className="btn primary" onClick={() => pause(focus.id)}><Icon name="pause" size={18} />Пауза</button>
                : <button className="btn primary" onClick={() => resume(focus.id)}><Icon name="play" size={18} />Продолжить</button>}
              <button className="btn ghost" onClick={() => reset(focus.id)}>Сброс</button>
              <button className="btn ghost" onClick={() => remove(focus.id)}>Стоп</button>
            </>
          )}
        </div>
        {focus?.taskId && focus.finished ? (
          <button className="btn soft" onClick={() => { toggleTask(focus.taskId, true); remove(focus.id); toast('Задача отмечена'); }}><Icon name="check" size={18} />Отметить задачу выполненной</button>
        ) : null}
      </div>

      <Section title="Побочные таймеры" count={side.length || null}>
        <div className="side-timers">
          {side.map((t) => {
            const l = timeLeft(t);
            return (
              <div key={t.id} className={cx('stimer card', t.finished && 'fin')}>
                <div className="grow">
                  <div className="st-name">{t.name}</div>
                  <div className="st-bar"><div style={{ width: `${(1 - l / t.total) * 100}%` }} /></div>
                </div>
                <b className="tnum st-time">{fmtClock(l)}</b>
                {t.finished ? <button className="icon-btn" onClick={() => reset(t.id)} aria-label="Заново"><Icon name="repeat" size={18} /></button>
                  : t.running ? <button className="icon-btn" onClick={() => pause(t.id)} aria-label="Пауза"><Icon name="pause" size={18} /></button>
                    : <button className="icon-btn" onClick={() => resume(t.id)} aria-label="Старт"><Icon name="play" size={18} /></button>}
                <button className="icon-btn" onClick={() => remove(t.id)} aria-label="Удалить"><Icon name="x" size={18} /></button>
              </div>
            );
          })}
        </div>
        <div className="card form">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название: чайник, стирка" />
          <div className="chips">{[3, 5, 10, 15, 30, 60].map((m) => <Chip key={m} on={min === m} onClick={() => setMin(m)}>{m} мин</Chip>)}</div>
          <button className="btn soft block" onClick={() => { start({ kind: 'side', minutes: min, name: name || `Таймер ${min} мин` }); setName(''); }}><Icon name="plus" size={18} />Запустить параллельно</button>
        </div>
        <div className="hint">Таймеры живут только на этом устройстве.</div>
      </Section>
    </>
  );
}

// ——— Заметки ———
function Notes() {
  const items = useData((s) => s.items);
  const open = useUI((s) => s.open);
  const [q, setQ] = useState('');
  const notes = itemsOf(items, 'note')
    .filter((n) => !q || (n.data.title + ' ' + n.data.text).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updated_at - a.updated_at);
  return (
    <>
      <div className="row gap">
        <div className="search-field grow"><Icon name="search" size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по заметкам" /></div>
        <button className="btn primary" onClick={() => open('add', { tab: 'note' })}><Icon name="plus" size={18} />Заметка</button>
      </div>
      {!notes.length ? <Empty icon="note" title={q ? 'Ничего не найдено' : 'Заметок пока нет'} text={q ? '' : 'Записывай идеи, конспекты и мысли — они синхронизируются между устройствами.'} /> : (
        <div className="notes">
          {notes.map((n) => (
            <button key={n.id} className="note card" onClick={() => open('note', { id: n.id })}>
              <div className="note-title">{n.data.title || 'Без заголовка'}</div>
              {n.data.text ? <div className="note-text">{n.data.text}</div> : null}
              <div className="muted sm">{fmtDate(new Date(n.updated_at).toISOString().slice(0, 10))}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ——— Экспорт ———
function Export() {
  const tasks = useData((s) => s.tasks);
  const items = useData((s) => s.items);
  const [ym, setYm] = useState(todayStr().slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const data = useMemo(() => buildExport({ tasks: Object.values(tasks), items: Object.values(items) }, ym), [tasks, items, ym]);
  const shift = (k) => { const d = new Date(y, m - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  return (
    <>
      <div className="nav-row">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Прошлый месяц"><Icon name="left" /></button>
        <div className="nav-title"><b>{MONTHS[m - 1]} {y}</b></div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Следующий месяц"><Icon name="right" /></button>
      </div>
      <div className="stats">
        <div className="stat card"><b className="tnum">{data.stats.tasks_total}</b><span>задач</span></div>
        <div className="stat card"><b className="tnum">{data.stats.tasks_done}</b><span>сделано</span></div>
        <div className="stat card"><b className="tnum">{data.stats.points}</b><span>очков</span></div>
        <div className="stat card"><b className="tnum">{data.days.length}</b><span>итогов дня</span></div>
      </div>
      <div className="card form">
        <p className="muted">Готовый промпт для Claude: просит разобрать месяц — что получилось, где проседаешь, привычки, энергия — и предложить три изменения. Данные месяца приложены JSON-ом в конце.</p>
        <button className="btn primary block" onClick={async () => { await copyText(exportPrompt(data)); toast('Промпт с данными скопирован'); }}><Icon name="copy" size={18} />Скопировать промпт с данными</button>
        <div className="row gap">
          <button className="btn soft grow" onClick={() => download(`planner-${ym}.json`, JSON.stringify(data, null, 2))}><Icon name="download" size={18} />JSON</button>
          <button className="btn soft grow" onClick={() => download(`planner-${ym}-prompt.md`, exportPrompt(data), 'text/markdown')}><Icon name="download" size={18} />Промпт .md</button>
        </div>
      </div>
      <div className="hint">Этот же JSON можно загрузить обратно через «Импорт».</div>
    </>
  );
}

// ——— Импорт ———
function Import() {
  const tasks = useData((s) => s.tasks);
  const items = useData((s) => s.items);
  const bulk = useData((s) => s.bulk);
  const [text, setText] = useState('');
  const { preview, err } = useMemo(() => {
    if (!text.trim()) return { preview: null, err: '' };
    try {
      const lc = (s) => String(s || '').trim().toLowerCase();
      return {
        err: '',
        preview: normalizeImport(text, {
          taskKeys: new Set(liveTasks(tasks).map((t) => `${lc(t.title)}|${t.date || ''}`)),
          habitNames: new Set(itemsOf(items, 'habit').map((h) => lc(h.data.name))),
          areaNames: new Set(itemsOf(items, 'area').map((a) => lc(a.data.name))),
          noteTitles: new Set(itemsOf(items, 'note').map((n) => lc(n.data.title || (n.data.text || '').slice(0, 40)))),
        }),
      };
    } catch (e) { return { preview: null, err: 'Не получилось прочитать JSON: ' + e.message }; }
  }, [text, tasks, items]);
  const run = () => {
    if (!preview) return;
    bulk(({ task, item }) => {
      for (const t of preview.tasks) task(t);
      for (const a of preview.areas) item('area', { name: a.name, goal: a.goal, color: '#6366f1' });
      for (const n of preview.notes) item('note', { ...n, created: Date.now() });
      for (const h of preview.habits) {
        const id = item('habit', { name: h.name, days: h.days, remind: h.remind, start: todayStr(), created: Date.now() });
        for (const d of h.done_dates || []) item('habit_log', { habit: id, date: d }, habitLogId(id, d));
      }
    });
    toast(`Импортировано: ${tasksWord(preview.tasks.length)}, привычек ${preview.habits.length}`);
    setText('');
  };
  return (
    <>
      <div className="card form">
        <p className="muted">Подходит файл экспорта или простой формат:</p>
        <pre className="code">{'{ "tasks": ["Купить хлеб", { "title": "Созвон", "date": "2026-10-20", "time": "16:00" }],\n  "habits": ["Зарядка"] }'}</pre>
        <label className="btn soft block file-btn">
          <Icon name="upload" size={18} />Выбрать файл
          <input type="file" accept=".json,application/json" onChange={async (e) => { const f = e.target.files[0]; if (f) setText(await f.text()); }} />
        </label>
        <textarea className="input mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="…или вставь JSON сюда" />
        {err ? <div className="err">{err}</div> : null}
        {preview ? (
          <div className="banner">
            <span className="grow">Будет добавлено: {tasksWord(preview.tasks.length)}, привычек — {preview.habits.length}, сфер — {preview.areas.length}, заметок — {preview.notes.length}. Дублей пропущено: {preview.skipped}.</span>
          </div>
        ) : null}
        <button className="btn primary block" disabled={!preview || !(preview.tasks.length + preview.habits.length + preview.areas.length + preview.notes.length)} onClick={run}>Импортировать</button>
      </div>
      <div className="hint">Дубли определяются по названию (у задач — название + дата).</div>
    </>
  );
}

// ——— Настройки ———
function Settings() {
  const s = useSettings();
  const setSettings = useData((x) => x.setSettings);
  const auth = useData((x) => x.auth);
  const setAuth = useData((x) => x.setAuth);
  const logout = useData((x) => x.logout);
  const setLocal = useData((x) => x.setLocal);
  const sync = useSync();
  const inTg = !!tgApp();
  const [me, setMe] = useState(null);
  const [keyIn, setKeyIn] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [botRes, setBotRes] = useState(null);
  const [notionTok, setNotionTok] = useState('');
  const [notionPage, setNotionPage] = useState('');
  const [msg, setMsg] = useState('');

  const loadMe = () => auth.key && api('/api/me').then(setMe).catch(() => {});
  useEffect(() => { loadMe(); }, [auth.key]);

  const doConnect = async (key) => {
    setBusy('key'); setMsg('');
    try {
      const r = await api('/api/me', { key: key.trim() });
      setAuth({ key: r.key, user: r.user });
      setMe(r);
      setKeyIn('');
      toast('Синхронизация подключена');
    } catch (e) { setMsg(e.message); }
    setBusy('');
  };
  const devLogin = async () => {
    try { const r = await api('/api/auth/dev', { method: 'POST' }); setAuth({ key: r.key, user: r.user }); setMe(r); } catch (e) { setMsg(e.message); }
  };
  const setupBot = async () => {
    setBusy('bot'); setBotRes(null);
    try { setBotRes(await api('/api/telegram/setup', { method: 'POST' })); } catch (e) { setBotRes({ ok: false, errors: [e.message] }); }
    setBusy('');
  };
  const connectNotion = async () => {
    setBusy('notion'); setMsg('');
    try { await api('/api/notion/connect', { method: 'POST', body: { token: notionTok, page: notionPage } }); toast('База «Планер» создана в Notion'); setNotionTok(''); setNotionPage(''); loadMe(); } catch (e) { setMsg(e.message); }
    setBusy('');
  };
  const set = (k) => (v) => setSettings({ [k]: v });

  return (
    <>
      <Section title="Тема">
        <Segmented value={s.theme} onChange={set('theme')} options={[
          { value: 'auto', label: 'Авто' }, { value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' },
        ]} />
        {inTg ? <div className="hint">«Авто» в Telegram следует теме Telegram.</div> : null}
      </Section>

      <Section title="Мои часы">
        <div className="card hours">
          <div className="hour-row"><span>Рабочий день</span><div className="hr-in"><TimeInput value={s.dayStart} onChange={set('dayStart')} /><span>—</span><TimeInput value={s.dayEnd} onChange={set('dayEnd')} /></div></div>
          <div className="hour-row"><span>Пик энергии</span><div className="hr-in"><TimeInput value={s.peakStart} onChange={set('peakStart')} /><span>—</span><TimeInput value={s.peakEnd} onChange={set('peakEnd')} /></div></div>
          <div className="hour-row"><span>Обед</span><div className="hr-in"><TimeInput value={s.lunchStart} onChange={set('lunchStart')} /><span>—</span><TimeInput value={s.lunchEnd} onChange={set('lunchEnd')} /></div></div>
          <div className="hour-row"><span>Лимит «Голова», ч</span><div className="hr-in">
            <div className="stepper">
              <button className="icon-btn sm" onClick={() => setSettings({ headLimitH: Math.max(1, (s.headLimitH || 4) - 0.5) })} aria-label="Меньше">−</button>
              <b className="tnum">{String(s.headLimitH).replace('.', ',')}</b>
              <button className="icon-btn sm" onClick={() => setSettings({ headLimitH: Math.min(10, (s.headLimitH || 4) + 0.5) })} aria-label="Больше">+</button>
            </div>
          </div></div>
        </div>
        <div className="hint">Время 24-часовое. Используется в «Спланировать день» и автоплане.</div>
      </Section>

      <Section title="Синхронизация">
        <div className="card form">
          {auth.key ? (
            <>
              <div className="row gap">
                <span className={cx('status-dot', sync.status === 'ok' ? 'ok' : sync.status === 'error' ? 'bad' : 'wait')} />
                <span className="grow">{me?.user?.name ? `${me.user.name} · ` : ''}{sync.status === 'ok' ? 'синхронизировано' : sync.status === 'error' ? sync.error : sync.status === 'offline' ? 'нет сети — правки сохранятся локально' : 'синхронизация…'}</span>
                <button className="btn ghost sm" onClick={() => syncNow()}><Icon name="sync" size={15} />Сейчас</button>
              </div>
              <Field label="Ключ для браузера и PWA" hint="Открой адрес планера в браузере на компьютере и вставь ключ — данные будут те же. Никому не показывай ключ.">
                <div className="key-box">
                  <code className="key">{showKey ? auth.key : auth.key.slice(0, 6) + '••••••••••••••••'}</code>
                  <button className="icon-btn sm" onClick={() => setShowKey(!showKey)} aria-label="Показать"><Icon name="search" size={15} /></button>
                  <button className="btn soft sm" onClick={async () => { await copyText(auth.key); toast('Ключ скопирован'); }}><Icon name="copy" size={15} />Копировать</button>
                </div>
              </Field>
              <div className="row gap wrap">
                <button className="btn ghost sm" onClick={async () => {
                  if (!window.confirm('Выпустить новый ключ? Старый перестанет работать на других устройствах.')) return;
                  const r = await api('/api/me/rotate-key', { method: 'POST' }); setAuth({ key: r.key, user: r.user }); toast('Новый ключ выпущен');
                }}>Новый ключ</button>
                {!inTg ? <button className="btn ghost sm" onClick={() => { if (window.confirm('Отключить синхронизацию на этом устройстве?')) logout(); }}>Выйти</button> : null}
              </div>
            </>
          ) : (
            <>
              <p className="muted">{inTg ? 'Не удалось войти через Telegram. Проверь, что задан секрет BOT_TOKEN.' : 'Сейчас данные хранятся только здесь. Вставь ключ из Mini App (Telegram → планер → Ещё → Настройки).'}</p>
              <div className="row gap">
                <input className="input" value={keyIn} onChange={(e) => setKeyIn(e.target.value)} placeholder="pk_…" />
                <button className="btn primary" disabled={!keyIn.trim() || busy === 'key'} onClick={() => doConnect(keyIn)}>Подключить</button>
              </div>
              {['localhost', '127.0.0.1'].includes(location.hostname) ? <button className="btn ghost sm" onClick={devLogin}>Демо-вход (локально)</button> : null}
              {msg ? <div className="err">{msg}</div> : null}
            </>
          )}
        </div>
      </Section>

      {auth.key ? (
        <>
          <Section title="Telegram-бот">
            <div className="card form">
              <p className="muted">Подключит вебхук, кнопку меню «Планер» и команды. Нужно один раз после деплоя — и после смены адреса.</p>
              <button className="btn soft block" disabled={busy === 'bot'} onClick={setupBot}><Icon name="bot" size={18} />{busy === 'bot' ? 'Настраиваю…' : 'Настроить бота'}</button>
              {botRes ? (botRes.ok
                ? <div className="banner good">Готово{botRes.username ? <>: <a href={`https://t.me/${botRes.username}`} target="_blank" rel="noreferrer">@{botRes.username}</a></> : ''}. Отправь боту голосовое.</div>
                : <div className="err">{(botRes.errors || []).join('; ') || 'Ошибка'}</div>) : null}
            </div>
          </Section>

          <Section title="Notion">
            <div className="card form">
              {me?.notion?.connected ? (
                <>
                  <div className="row gap"><span className={cx('status-dot', me.notion.error ? 'bad' : 'ok')} /><span className="grow">База «Планер» подключена. Задачи с датой досылаются каждые 5 минут.</span></div>
                  {me.notion.error ? <div className="err">Последняя ошибка: {me.notion.error}</div> : null}
                  <div className="row gap wrap">
                    <button className="btn soft sm" onClick={async () => { const r = await api('/api/notion/sync', { method: 'POST' }); toast(`Отправлено в Notion: ${r.created + r.updated + r.archived}`); loadMe(); }}><Icon name="sync" size={15} />Синк сейчас</button>
                    <button className="btn ghost sm" onClick={async () => { await api('/api/notion/disconnect', { method: 'POST' }); loadMe(); }}>Отключить</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">1. notion.so/profile/integrations → New integration → скопируй Internal Integration Secret. 2. Открой страницу в Notion → ••• → Connections → добавь интеграцию. 3. Вставь секрет и ссылку на страницу — создам в ней базу «Планер».</p>
                  <Field label="Секрет интеграции"><input className="input" value={notionTok} onChange={(e) => setNotionTok(e.target.value)} placeholder="ntn_… или secret_…" /></Field>
                  <Field label="Ссылка на страницу"><input className="input" value={notionPage} onChange={(e) => setNotionPage(e.target.value)} placeholder="https://www.notion.so/…" /></Field>
                  <button className="btn soft block" disabled={!notionTok || !notionPage || busy === 'notion'} onClick={connectNotion}>{busy === 'notion' ? 'Создаю базу…' : 'Подключить Notion'}</button>
                  {msg ? <div className="err">{msg}</div> : null}
                </>
              )}
            </div>
          </Section>
        </>
      ) : null}

      <Section title="Прочее">
        <div className="card menu">
          <button className="menu-row" onClick={() => setLocal({ onboarded: false })}><span className="grow">Показать знакомство</span><Icon name="right" size={16} /></button>
          <button className="menu-row" onClick={() => { if (window.confirm('Удалить все данные с этого устройства? С сервера ничего не удалится.')) { useData.getState().resetAll(); location.reload(); } }}><span className="grow danger">Очистить данные на устройстве</span><Icon name="right" size={16} /></button>
        </div>
      </Section>
    </>
  );
}
