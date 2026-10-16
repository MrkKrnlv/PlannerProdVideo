// Строка задачи, быстрый ввод, редактор задачи
import { useMemo, useState } from 'react';
import Icon from '../icons.jsx';
import { useData, useSettings } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, haptic, itemsOf, areaColor, uid } from '../lib.js';
import { Check, Sheet, Toggle, Chip, AutoText, Segmented } from './ui.jsx';
import { DateField, TimeField, DurationField } from './pickers.jsx';
import { parseQuick, parsedChips, repeatLabel } from '../../shared/parse.js';
import { fmtDur, todayStr, relDay, addDays, WD_SHORT, weekday, toMin, fromMin } from '../../shared/dates.js';
import { taskDur } from '../../shared/planning.js';
import { useTimers } from '../timers.js';

export function completeTask(id, done) {
  const st = useData.getState();
  const t = st.tasks[id];
  const was = t?.done;
  st.toggleTask(id, done);
  if (!was && (done ?? true)) {
    haptic('success');
    if (t?.repeat) toast('Готово. Следующий повтор создан');
  } else haptic('light');
}

export function TaskMeta({ t, showDate = false }) {
  const items = useData((s) => s.items);
  const color = areaColor(items, t.area);
  const parts = [];
  if (showDate && t.date) parts.push(<span key="d">{relDay(t.date)}</span>);
  if (t.time) parts.push(<span key="t" className="tnum">{t.time}{t.duration_min ? `–${fromMin(toMin(t.time) + t.duration_min)}` : ''}</span>);
  else if (t.duration_min) parts.push(<span key="du">{fmtDur(t.duration_min)}</span>);
  if (t.area) parts.push(<span key="a" className="area-tag"><i style={{ background: color || 'var(--accent)' }} />{t.area}</span>);
  if (t.deep) parts.push(<span key="dp" className="tag deep"><Icon name="bolt" size={12} />глубоко</span>);
  if (t.repeat) parts.push(<span key="r" className="tag"><Icon name="repeat" size={12} />{repeatLabel(t.repeat)}</span>);
  if (t.checklist?.length) parts.push(<span key="c" className="tag">{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>);
  if (t.priority === 1 && !t.frog) parts.push(<span key="p" className="tag prio">важно</span>);
  if (t.source === 'voice') parts.push(<span key="v" className="tag"><Icon name="mic" size={12} /></span>);
  if (!parts.length) return null;
  return <div className="task-meta">{parts}</div>;
}

export function TaskRow({ t, showDate = false, actions, compact = false }) {
  const open = useUI((s) => s.open);
  return (
    <div className={cx('task-row', t.done && 'done', t.frog && 'frog', compact && 'compact', t.priority === 3 && 'low')} onClick={() => open('task', { id: t.id })}>
      <Check checked={t.done} frog={t.frog} onChange={(v) => completeTask(t.id, v)} />
      <div className="task-main">
        <div className="task-title">
          {t.frog ? <span className="frog-badge"><Icon name="star" size={12} fill="currentColor" stroke={0} />главное</span> : null}
          {t.title || 'Без названия'}
        </div>
        <TaskMeta t={t} showDate={showDate} />
      </div>
      {actions ? <div className="task-actions" onClick={(e) => e.stopPropagation()}>{actions}</div> : null}
    </div>
  );
}

export function QuickInput({ defaultDate, placeholder = 'Созвон 1.5ч в 16:00 завтра #работа !', autoFocus = false, onAdded }) {
  const [v, setV] = useState('');
  const addTask = useData((s) => s.addTask);
  const putItem = useData((s) => s.putItem);
  const items = useData((s) => s.items);
  const today = todayStr();
  const parsed = useMemo(() => (v.trim() ? parseQuick(v) : null), [v]);
  const chips = parsed ? parsedChips(parsed, today) : [];
  const submit = () => {
    if (!parsed || !parsed.title) return;
    const date = parsed.date !== undefined ? parsed.date : defaultDate ?? null;
    if (parsed.area && !itemsOf(items, 'area').some((a) => a.data.name === parsed.area)) {
      const n = itemsOf(items, 'area').length;
      putItem('area', null, { name: parsed.area, color: ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9'][n % 6], goal: 0 });
    }
    addTask({
      title: parsed.title, date, time: parsed.time, slot: parsed.slot || 'anytime', duration_min: parsed.duration_min,
      area: parsed.area, priority: parsed.priority, frog: parsed.frog, deep: parsed.deep, repeat: parsed.repeat,
    });
    haptic('light');
    setV('');
    onAdded?.();
    if (date && date !== defaultDate) toast(`Добавлено на ${relDay(date).toLowerCase()}`);
  };
  return (
    <div className="quick">
      <form className="quick-in" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Icon name="plus" size={18} className="quick-ic" />
        <input className="quick-input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
          autoFocus={autoFocus} enterKeyHint="done" aria-label="Быстрый ввод задачи" />
        {v.trim() ? <button className="btn primary sm" type="submit">Добавить</button> : null}
      </form>
      {chips.length ? (
        <div className="quick-chips">
          {chips.map((c) => <span key={c.k + c.label} className={cx('pchip', c.k)}>{c.label}</span>)}
        </div>
      ) : null}
    </div>
  );
}

const REPEATS = [
  { value: 'none', label: 'Нет' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekdays', label: 'Будни' },
  { value: 'weekly', label: 'Дни недели' },
  { value: 'monthly', label: 'Месяц' },
];

export function TaskSheet({ id }) {
  const t = useData((s) => s.tasks[id]);
  const items = useData((s) => s.items);
  const { updateTask, deleteTask, restoreTask, putItem } = useData.getState();
  const close = useUI((s) => s.close);
  const startTimer = useTimers((s) => s.start);
  const go = useUI((s) => s.go);
  const [newItem, setNewItem] = useState('');
  const [newArea, setNewArea] = useState(null);
  if (!t || t.deleted) return null;
  const up = (p) => updateTask(id, p);
  const areas = itemsOf(items, 'area');
  const rep = t.repeat?.type || 'none';
  const setRepeat = (type) => {
    if (type === 'none') return up({ repeat: null });
    const r = { type };
    if (type === 'weekly') r.days = t.repeat?.days?.length ? t.repeat.days : [weekday(t.date || todayStr())];
    up({ repeat: r, date: t.date || todayStr() });
  };
  const toggleDay = (d) => {
    const days = new Set(t.repeat?.days || []);
    days.has(d) ? days.delete(d) : days.add(d);
    if (!days.size) return;
    up({ repeat: { ...t.repeat, days: [...days].sort() } });
  };
  const cl = t.checklist || [];
  const addItem = () => {
    if (!newItem.trim()) return;
    up({ checklist: cl.concat({ id: uid('c'), text: newItem.trim(), done: false }) });
    setNewItem('');
  };
  const remove = () => {
    const snapshot = { ...t };
    deleteTask(id);
    close();
    toast('Задача удалена', { label: 'Вернуть', run: () => restoreTask(snapshot) });
  };
  const focus = () => {
    startTimer({ kind: 'focus', name: t.title, taskId: t.id, minutes: Math.min(taskDur(t), 50) <= 25 ? 25 : 50 });
    close();
    go('more', 'timers');
  };
  return (
    <Sheet title={t.done ? 'Задача выполнена' : 'Задача'}
      footer={(
        <div className="row gap wrap">
          <button className="btn soft" onClick={focus}><Icon name="timer" size={18} />Фокус</button>
          {t.date ? <button className="btn ghost" onClick={() => { up({ date: null, time: null }); toast('Перенесено во входящие'); }}><Icon name="inbox" size={18} />Во входящие</button> : null}
          <span className="grow" />
          <button className="btn danger-ghost" onClick={remove} aria-label="Удалить"><Icon name="trash" size={18} /></button>
        </div>
      )}>
      <div className="task-edit-title">
        <Check checked={t.done} frog={t.frog} size={28} onChange={(v) => completeTask(id, v)} />
        <AutoText className="title-input" value={t.title} onChange={(v) => up({ title: v })} placeholder="Название задачи" />
      </div>

      <div className="card-group">
        <DateField value={t.date} onChange={(d) => up({ date: d, ...(d ? {} : { time: null }) })} />
        <TimeField value={t.time} onChange={(v) => up({ time: v, date: t.date || (v ? todayStr() : t.date) })} />
        <DurationField value={t.duration_min} onChange={(v) => up({ duration_min: v })} />
      </div>

      <div className="label-sm">Приоритет</div>
      <Segmented value={t.priority || 2} onChange={(v) => up({ priority: v })} small options={[
        { value: 1, label: 'Важно' }, { value: 2, label: 'Обычно' }, { value: 3, label: 'Не срочно' },
      ]} />

      <div className="card-group">
        <Toggle checked={!!t.frog} onChange={(v) => up({ frog: v, ...(v && !t.date ? { date: todayStr() } : {}) })} label="Главное на день" icon="star" tone="frog" />
        <Toggle checked={!!t.deep} onChange={(v) => up({ deep: v })} label="Глубокая работа" icon="bolt" />
      </div>

      <div className="label-sm">Сфера</div>
      <div className="chips">
        <Chip on={!t.area} onClick={() => up({ area: null })}>Без сферы</Chip>
        {areas.map((a) => (
          <Chip key={a.id} on={t.area === a.data.name} onClick={() => up({ area: a.data.name })}>
            <i className="dot" style={{ background: a.data.color }} />{a.data.name}
          </Chip>
        ))}
        {newArea == null ? <Chip icon="plus" onClick={() => setNewArea('')}>Новая</Chip> : (
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault();
            const name = newArea.trim().toLowerCase();
            if (!name) return;
            putItem('area', null, { name, color: ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9'][areas.length % 6], goal: 0 });
            up({ area: name });
            setNewArea(null);
          }}>
            <input className="input sm" autoFocus value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Название" />
          </form>
        )}
      </div>

      <div className="label-sm">Повтор</div>
      <div className="chips">
        {REPEATS.map((r) => <Chip key={r.value} on={rep === r.value} onClick={() => setRepeat(r.value)}>{r.label}</Chip>)}
      </div>
      {rep === 'weekly' ? (
        <div className="wd-pick">
          {WD_SHORT.map((w, i) => <button type="button" key={w} className={cx('wd', t.repeat?.days?.includes(i + 1) && 'on')} onClick={() => toggleDay(i + 1)}>{w}</button>)}
        </div>
      ) : null}
      {rep !== 'none' ? <div className="hint">Следующая задача создаётся, когда отмечаешь эту выполненной.</div> : null}

      <div className="label-sm">Подзадачи</div>
      <div className="checklist">
        {cl.map((c) => (
          <div key={c.id} className={cx('cl-row', c.done && 'done')}>
            <Check size={20} checked={c.done} onChange={(v) => up({ checklist: cl.map((x) => (x.id === c.id ? { ...x, done: v } : x)) })} />
            <input className="cl-text" value={c.text} onChange={(e) => up({ checklist: cl.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })} />
            <button className="icon-btn sm" onClick={() => up({ checklist: cl.filter((x) => x.id !== c.id) })} aria-label="Удалить пункт"><Icon name="x" size={16} /></button>
          </div>
        ))}
        <form className="cl-row add" onSubmit={(e) => { e.preventDefault(); addItem(); }}>
          <Icon name="plus" size={18} />
          <input className="cl-text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Добавить пункт" />
        </form>
      </div>

      <div className="label-sm">Заметка</div>
      <AutoText value={t.note || ''} onChange={(v) => up({ note: v })} placeholder="Детали, ссылки, мысли" minRows={2} />
      {t.source && t.source !== 'app' ? <div className="hint">Источник: {t.source === 'voice' ? 'голосовое в боте' : 'API / бот'}</div> : null}
    </Sheet>
  );
}

export function nextFreeTime(dayTasks, settings, date) {
  const today = todayStr();
  const d = new Date();
  let cur = date === today ? Math.max(toMin(settings.dayStart), Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15) : toMin(settings.dayStart);
  const busy = dayTasks.filter((t) => t.time && !t.deleted).map((t) => [toMin(t.time), toMin(t.time) + taskDur(t)]).sort((a, b) => a[0] - b[0]);
  for (const [a, b] of busy) if (cur + 30 > a && cur < b) cur = b;
  return fromMin(Math.min(cur, 23 * 60));
}

export { addDays };
