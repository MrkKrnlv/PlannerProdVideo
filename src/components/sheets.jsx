// Единая шторка «+», привычки, сферы, заметки
import { useState } from 'react';
import Icon from '../icons.jsx';
import { useData } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, AREA_COLORS, itemsOf } from '../lib.js';
import { Sheet, Segmented, Field, AutoText, Chip } from './ui.jsx';
import { QuickInput } from './tasks.jsx';
import { TimeInput } from './pickers.jsx';
import { WD_SHORT, todayStr } from '../../shared/dates.js';
import { useTimers } from '../timers.js';

export function AddSheet({ tab: initial = 'task' }) {
  const [tab, setTab] = useState(initial);
  const date = useUI((s) => s.date);
  const close = useUI((s) => s.close);
  return (
    <Sheet title="Добавить">
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'task', label: 'Задача', icon: 'check' },
        { value: 'habit', label: 'Привычка', icon: 'flame' },
        { value: 'note', label: 'Заметка', icon: 'note' },
        { value: 'timer', label: 'Таймер', icon: 'timer' },
      ]} className="add-tabs" />
      {tab === 'task' ? (
        <div className="add-pane">
          <QuickInput defaultDate={date} autoFocus onAdded={() => { close(); toast('Задача добавлена'); }} />
          <div className="syntax">
            <div><b>16:00</b>, <b>в 9 утра</b> — время</div>
            <div><b>1.5ч</b>, <b>30м</b> — длительность</div>
            <div><b>завтра</b>, <b>в пт</b>, <b>20.10</b> — дата</div>
            <div><b>утром</b> / <b>днём</b> / <b>вечером</b></div>
            <div><b>#сфера</b>, <b>!</b> важно, <b>!!</b> главное, <b>~</b> не срочно</div>
            <div><b>каждый день</b>, <b>по будням</b>, <b>по пн и чт</b></div>
          </div>
        </div>
      ) : null}
      {tab === 'habit' ? <HabitForm onDone={close} /> : null}
      {tab === 'note' ? <NoteForm onDone={close} /> : null}
      {tab === 'timer' ? <TimerForm onDone={close} /> : null}
    </Sheet>
  );
}

function DaysPick({ days, onChange }) {
  const set = new Set(days);
  return (
    <div className="wd-pick">
      {WD_SHORT.map((w, i) => (
        <button type="button" key={w} className={cx('wd', set.has(i + 1) && 'on')} onClick={() => {
          const n = new Set(set);
          n.has(i + 1) ? n.delete(i + 1) : n.add(i + 1);
          if (n.size) onChange([...n].sort());
        }}>{w}</button>
      ))}
    </div>
  );
}

export function HabitForm({ habit, onDone }) {
  const putItem = useData((s) => s.putItem);
  const [name, setName] = useState(habit?.data.name || '');
  const [days, setDays] = useState(habit?.data.days || [1, 2, 3, 4, 5, 6, 7]);
  const [remind, setRemind] = useState(habit?.data.remind || '');
  const save = () => {
    if (!name.trim()) return;
    putItem('habit', habit?.id || null, { name: name.trim(), days, remind: remind || null, ...(habit ? {} : { start: todayStr(), created: Date.now() }) });
    toast(habit ? 'Сохранено' : 'Привычка добавлена');
    onDone?.();
  };
  return (
    <div className="add-pane form">
      <Field label="Название">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: зарядка 10 минут" autoFocus={!habit} />
      </Field>
      <div className="field"><span className="field-label">Дни недели</span><DaysPick days={days} onChange={setDays} /></div>
      <div className="chips">
        <Chip on={days.length === 7} onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>Каждый день</Chip>
        <Chip on={days.join() === '1,2,3,4,5'} onClick={() => setDays([1, 2, 3, 4, 5])}>Будни</Chip>
        <Chip on={days.join() === '6,7'} onClick={() => setDays([6, 7])}>Выходные</Chip>
      </div>
      <Field label="Напоминание в боте" hint="Бот пришлёт сообщение в это время, если привычка ещё не отмечена. Пусто — без напоминания.">
        <div className="row gap">
          <TimeInput value={remind} onChange={setRemind} />
          {remind ? <button type="button" className="btn ghost sm" onClick={() => setRemind('')}>Убрать</button> : null}
        </div>
      </Field>
      <button className="btn primary block" onClick={save} disabled={!name.trim()}>{habit ? 'Сохранить' : 'Добавить привычку'}</button>
    </div>
  );
}

export function HabitSheet({ id }) {
  const h = useData((s) => s.items[id]);
  const { deleteItem, putItem } = useData.getState();
  const close = useUI((s) => s.close);
  if (!h || h.deleted) return null;
  return (
    <Sheet title="Привычка" footer={(
      <div className="row gap">
        <button className="btn ghost" onClick={() => { putItem('habit', id, { archived: !h.data.archived }); close(); }}>{h.data.archived ? 'Вернуть из архива' : 'В архив'}</button>
        <span className="grow" />
        <button className="btn danger-ghost" onClick={() => { deleteItem(id); close(); toast('Привычка удалена'); }}><Icon name="trash" size={18} /></button>
      </div>
    )}>
      <HabitForm habit={h} onDone={close} />
    </Sheet>
  );
}

export function NoteForm({ note, onDone }) {
  const putItem = useData((s) => s.putItem);
  const [title, setTitle] = useState(note?.data.title || '');
  const [text, setText] = useState(note?.data.text || '');
  const save = () => {
    if (!title.trim() && !text.trim()) return onDone?.();
    putItem('note', note?.id || null, { title: title.trim(), text, ...(note ? {} : { created: Date.now() }) });
    if (!note) toast('Заметка сохранена');
    onDone?.();
  };
  return (
    <div className="add-pane form">
      <input className="input title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" autoFocus={!note} />
      <AutoText value={text} onChange={setText} placeholder="Текст заметки" minRows={5} />
      <button className="btn primary block" onClick={save}>Сохранить</button>
    </div>
  );
}

export function NoteSheet({ id }) {
  const n = useData((s) => s.items[id]);
  const deleteItem = useData((s) => s.deleteItem);
  const close = useUI((s) => s.close);
  if (!n || n.deleted) return null;
  return (
    <Sheet title="Заметка" footer={(
      <div className="row"><span className="grow" /><button className="btn danger-ghost" onClick={() => { deleteItem(id); close(); toast('Заметка удалена'); }}><Icon name="trash" size={18} />Удалить</button></div>
    )}>
      <NoteForm note={n} onDone={close} />
    </Sheet>
  );
}

function TimerForm({ onDone }) {
  const start = useTimers((s) => s.start);
  const go = useUI((s) => s.go);
  const [name, setName] = useState('');
  const [min, setMin] = useState(10);
  const run = (kind, minutes, nm) => {
    start({ kind, minutes, name: nm || name || (kind === 'focus' ? 'Фокус' : 'Таймер') });
    onDone?.();
    go('more', 'timers');
  };
  return (
    <div className="add-pane form">
      <div className="row gap">
        <button className="btn soft grow" onClick={() => run('focus', 25, 'Фокус 25')}><Icon name="target" size={18} />Фокус 25</button>
        <button className="btn soft grow" onClick={() => run('focus', 50, 'Фокус 50')}><Icon name="target" size={18} />Фокус 50</button>
      </div>
      <div className="label-sm">Побочный таймер</div>
      <Field label="Название"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Чайник, стирка, перерыв" /></Field>
      <div className="chips">
        {[3, 5, 10, 15, 30, 60].map((m) => <Chip key={m} on={min === m} onClick={() => setMin(m)}>{m} мин</Chip>)}
      </div>
      <button className="btn primary block" onClick={() => run('side', min)}>Запустить</button>
    </div>
  );
}

export function AreaSheet({ id }) {
  const a = useData((s) => (id ? s.items[id] : null));
  const items = useData((s) => s.items);
  const { putItem, deleteItem, updateTasks } = useData.getState();
  const close = useUI((s) => s.close);
  const [name, setName] = useState(a?.data.name || '');
  const [goal, setGoal] = useState(String(a?.data.goal ?? 5));
  const [color, setColor] = useState(a?.data.color || AREA_COLORS[itemsOf(items, 'area').length % AREA_COLORS.length]);
  const save = () => {
    const nm = name.trim().toLowerCase();
    if (!nm) return;
    if (a && a.data.name !== nm) {
      const ids = Object.values(useData.getState().tasks).filter((t) => t.area === a.data.name).map((t) => t.id);
      updateTasks(ids, { area: nm });
    }
    putItem('area', a?.id || null, { name: nm, goal: Math.max(0, Number(goal.replace(',', '.')) || 0), color });
    close();
  };
  return (
    <Sheet title={a ? 'Сфера' : 'Новая сфера'} footer={a ? (
      <div className="row"><span className="grow" /><button className="btn danger-ghost" onClick={() => { deleteItem(a.id); close(); }}><Icon name="trash" size={18} />Удалить</button></div>
    ) : null}>
      <div className="form">
        <Field label="Название"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="работа, здоровье, учёба" autoFocus={!a} /></Field>
        <Field label="Цель в неделю, часов"><input className="input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
        <div className="field"><span className="field-label">Цвет</span>
          <div className="colors">{AREA_COLORS.map((c) => <button type="button" key={c} className={cx('color', c === color && 'on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
        </div>
        <button className="btn primary block" onClick={save} disabled={!name.trim()}>Сохранить</button>
      </div>
    </Sheet>
  );
}
