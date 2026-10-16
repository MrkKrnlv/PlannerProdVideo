// Экран «Сегодня»: Сейчас, неделя, быстрый ввод, план дня, без времени, хвосты, привычки
import { useMemo } from 'react';
import Icon from '../icons.jsx';
import { useData, useSettings } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, tasksForDate, overdue, sortTasks, habitsForDay, isHabitDone, tasksWord, haptic, habitLogSet } from '../lib.js';
import { Section, Empty, useNow, PageHead, Check } from '../components/ui.jsx';
import { TaskRow, QuickInput, completeTask, TaskMeta } from '../components/tasks.jsx';
import { todayStr, addDays, weekDays, WD_SHORT, WD_FULL, weekday, parseDate, fmtDate, toMin, fromMin, nowMin, fmtDur, SLOT_NAMES, diffDays, MONTHS_GEN } from '../../shared/dates.js';
import { taskDur, dayLoad, habitStreak, timeScale } from '../../shared/planning.js';
import { useTimers } from '../timers.js';

export default function Today() {
  const date = useUI((s) => s.date);
  const setDate = useUI((s) => s.setDate);
  const open = useUI((s) => s.open);
  const setSearch = useUI((s) => s.setSearch);
  const tasks = useData((s) => s.tasks);
  const settings = useSettings();
  const now = useNow(30000);
  const today = todayStr(now);
  const isToday = date === today;
  const dayTasks = useMemo(() => tasksForDate(tasks, date), [tasks, date]);
  const timed = dayTasks.filter((t) => t.time);
  const untimed = sortTasks(dayTasks.filter((t) => !t.time));
  const tails = useMemo(() => (isToday ? overdue(tasks, today) : []), [tasks, isToday, today]);
  const d = parseDate(date);
  const openCount = dayTasks.filter((t) => !t.done).length;
  const doneCount = dayTasks.length - openCount;

  return (
    <div className="screen today">
      <PageHead
        title={isToday ? 'Сегодня' : diffDays(today, date) === 1 ? 'Завтра' : diffDays(today, date) === -1 ? 'Вчера' : `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`}
        sub={`${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD_FULL[weekday(date) - 1]}${dayTasks.length ? ` · ${doneCount} из ${dayTasks.length}` : ''}`}
        right={(
          <>
            {!isToday ? <button className="btn ghost sm" onClick={() => setDate(today)}>К сегодня</button> : null}
            <button className="icon-btn" onClick={() => setSearch(true)} aria-label="Поиск"><Icon name="search" /></button>
          </>
        )}
      />
      <div className="today-grid">
        <div className="today-main">
          {isToday ? <NowCard dayTasks={dayTasks} now={now} /> : null}
          <WeekStrip date={date} today={today} tasks={tasks} settings={settings} onPick={setDate} />
          <QuickInput defaultDate={date} />
          <div className="day-actions">
            <button className="btn soft" onClick={() => open('planDay', { date })}><Icon name="wand" size={18} />Спланировать день</button>
            <LoadPill dayTasks={dayTasks} settings={settings} />
          </div>

          <div className="plan-mobile">
            <DayPlan date={date} timed={timed} settings={settings} now={now} isToday={isToday} />
          </div>

          {dayTasks.length ? (
            <Section title="Без времени" count={untimed.filter((t) => !t.done).length || null}>
              {untimed.length ? <SlotGroups list={untimed} /> : <div className="muted pad-s">Всё распределено по времени.</div>}
            </Section>
          ) : null}

          {tails.length ? <Tails tails={tails} today={today} settings={settings} /> : null}

          <HabitsToday date={date} />

          {dayTasks.length || isToday ? (
            <button className="btn finish block" onClick={() => open('closeDay', { date })}>
              <Icon name="moon" size={18} />Завершить день{openCount ? <span className="muted">· {openCount} не сделано</span> : null}
            </button>
          ) : null}
        </div>
        <aside className="today-side">
          <DayPlan date={date} timed={timed} settings={settings} now={now} isToday={isToday} />
        </aside>
      </div>
    </div>
  );
}

function LoadPill({ dayTasks, settings }) {
  const sc = timeScale(dayTasks, settings);
  if (!dayTasks.length) return null;
  const pct = Math.round(sc.ratio * 100);
  return <span className={cx('load-pill', sc.ratio > 1 ? 'bad' : sc.ratio > 0.85 ? 'warn' : 'good')} title="Загрузка: длительность ×1.5 против 65% рабочего дня">{pct}% дня</span>;
}

function SlotGroups({ list }) {
  const groups = ['morning', 'afternoon', 'evening', 'anytime'].map((k) => [k, list.filter((t) => (t.slot || 'anytime') === k)]).filter(([, l]) => l.length);
  if (groups.length === 1 && groups[0][0] === 'anytime') return <div className="list">{list.map((t) => <TaskRow key={t.id} t={t} />)}</div>;
  return groups.map(([k, l]) => (
    <div key={k} className="slot-group">
      <div className="slot-name">{SLOT_NAMES[k]}</div>
      <div className="list">{l.map((t) => <TaskRow key={t.id} t={t} />)}</div>
    </div>
  ));
}

function NowCard({ dayTasks, now }) {
  const open = useUI((s) => s.open);
  const go = useUI((s) => s.go);
  const startTimer = useTimers((s) => s.start);
  const focusTimer = useTimers((s) => s.list.find((t) => t.kind === 'focus' && (t.running || t.left < t.total) && !t.finished));
  const m = nowMin(now);
  const openTasks = dayTasks.filter((t) => !t.done);
  const current = openTasks.find((t) => t.time && toMin(t.time) <= m && toMin(t.time) + taskDur(t) > m);
  const next = openTasks.filter((t) => t.time && toMin(t.time) > m).sort((a, b) => toMin(a.time) - toMin(b.time))[0];
  const frog = openTasks.find((t) => t.frog);
  const pick = current || next || frog || sortTasks(openTasks.filter((t) => !t.time))[0];
  if (!pick) {
    const done = dayTasks.filter((t) => t.done).length;
    return (
      <div className="now-card card calm">
        <div className="now-label">Сейчас</div>
        <div className="now-title">{done ? 'Все задачи на сегодня сделаны' : 'Свободно'}</div>
        <div className="now-sub">{done ? `Закрыто ${tasksWord(done)}. Можно отдохнуть или взять задачу из входящих.` : 'Добавь задачу или спланируй день.'}</div>
      </div>
    );
  }
  const isCur = pick === current;
  const st = pick.time ? toMin(pick.time) : null;
  const left = isCur ? st + taskDur(pick) - m : st != null ? st - m : null;
  const progress = isCur ? (m - st) / taskDur(pick) : 0;
  return (
    <div className={cx('now-card card', pick.frog && 'frog', isCur && 'live')} onClick={() => open('task', { id: pick.id })}>
      <div className="now-top">
        <span className="now-label">{isCur ? 'Сейчас' : pick === next ? 'Дальше' : pick.frog ? 'Главное на сегодня' : 'Следующее'}</span>
        {pick.time ? <span className="now-time tnum">{pick.time}–{fromMin(st + taskDur(pick))}</span> : null}
      </div>
      <div className="now-title">{pick.title}</div>
      <div className="now-sub">
        {isCur ? `Осталось ${fmtDur(left)}` : left != null ? `Через ${fmtDur(left)}` : pick.duration_min ? fmtDur(pick.duration_min) : 'Без времени'}
        {pick.area ? ` · ${pick.area}` : ''}
      </div>
      {isCur ? <div className="now-progress"><div style={{ width: `${Math.min(100, progress * 100)}%` }} /></div> : null}
      <div className="now-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn glassy" onClick={() => {
          if (!focusTimer) startTimer({ kind: 'focus', name: pick.title, taskId: pick.id, minutes: taskDur(pick) > 30 ? 50 : 25 });
          go('more', 'timers');
        }}><Icon name="target" size={18} />{focusTimer ? 'К таймеру' : 'Фокус'}</button>
        <button className="btn primary" onClick={() => completeTask(pick.id, true)}><Icon name="check" size={18} />Готово</button>
      </div>
    </div>
  );
}

function WeekStrip({ date, today, tasks, settings, onPick }) {
  const days = weekDays(date);
  const shift = (n) => onPick(addDays(date, n));
  return (
    <div className="week-strip card">
      <button className="icon-btn sm" onClick={() => shift(-7)} aria-label="Прошлая неделя"><Icon name="left" size={16} /></button>
      <div className="ws-days">
        {days.map((d, i) => {
          const list = tasksForDate(tasks, d);
          const load = dayLoad(list, settings).ratio;
          const allDone = list.length && list.every((t) => t.done);
          return (
            <button key={d} className={cx('ws-day', d === date && 'on', d === today && 'today', i > 4 && 'we')} onClick={() => onPick(d)}>
              <span className="ws-wd">{WD_SHORT[i]}</span>
              <span className="ws-n">{parseDate(d).getDate()}</span>
              <span className={cx('ws-dot', allDone ? 'done' : load > 0.9 ? 'hi' : load > 0.5 ? 'mid' : list.length ? 'lo' : 'none')} />
            </button>
          );
        })}
      </div>
      <button className="icon-btn sm" onClick={() => shift(7)} aria-label="Следующая неделя"><Icon name="right" size={16} /></button>
    </div>
  );
}

// План дня блоками: высота от длительности, свободные окна, линия «сейчас»
export function DayPlan({ date, timed, settings, now, isToday }) {
  const open = useUI((s) => s.open);
  const sorted = [...timed].sort((a, b) => toMin(a.time) - toMin(b.time) || (a.done ? 1 : 0) - (b.done ? 1 : 0));
  const st = Math.min(toMin(settings.dayStart), ...sorted.map((t) => toMin(t.time)));
  const en = Math.max(toMin(settings.dayEnd), ...sorted.map((t) => toMin(t.time) + taskDur(t)));
  const m = nowMin(now);
  const showNow = isToday && m >= st && m <= en;
  const rows = [];
  let cur = st;
  let nowPlaced = !showNow;
  const pushNow = (key) => { rows.push(<div key={key} className="tl-now"><span className="tnum">{fromMin(m)}</span><i /></div>); nowPlaced = true; };
  sorted.forEach((t, idx) => {
    const a = toMin(t.time);
    const b = a + taskDur(t);
    if (a - cur >= 15) {
      if (!nowPlaced && m < a && m >= cur) {
        if (m - cur >= 15) rows.push(<FreeSlot key={'f1' + idx} from={cur} to={m} />);
        pushNow('n' + idx);
        if (a - m >= 15) rows.push(<FreeSlot key={'f2' + idx} from={m} to={a} past={false} />);
      } else rows.push(<FreeSlot key={'f' + idx} from={cur} to={a} past={isToday && a <= m} />);
    } else if (!nowPlaced && m < a && m >= cur) pushNow('n' + idx);
    const live = isToday && m >= a && m < b;
    if (live) nowPlaced = true;
    rows.push(<Block key={t.id} t={t} live={live} frac={live ? (m - a) / (b - a) : 0} onOpen={() => open('task', { id: t.id })} past={isToday && b <= m} />);
    cur = Math.max(cur, b);
  });
  if (en - cur >= 15) {
    if (!nowPlaced && m >= cur) {
      if (m - cur >= 15) rows.push(<FreeSlot key="fe1" from={cur} to={m} past />);
      pushNow('ne');
      if (en - m >= 15) rows.push(<FreeSlot key="fe2" from={m} to={en} />);
    } else rows.push(<FreeSlot key="fe" from={cur} to={en} past={isToday && en <= m} />);
  } else if (!nowPlaced) pushNow('ne');

  return (
    <div className="dayplan card">
      <div className="dp-head">
        <h3>План дня</h3>
        <span className="muted sm tnum">{fromMin(st)}–{fromMin(en)}</span>
      </div>
      {!sorted.length ? (
        <Empty icon="clock" title="Нет задач со временем" text="Нажми «Спланировать день» — расставлю задачи по свободным окнам." />
      ) : <div className="timeline">{rows}</div>}
    </div>
  );
}

function FreeSlot({ from, to, past }) {
  const h = Math.max(30, Math.min(110, (to - from) * 0.55));
  return (
    <div className={cx('tl-free', past && 'past')} style={{ minHeight: h }}>
      <span className="tl-time tnum">{fromMin(from)}</span>
      <div className="tl-free-box">Свободно · {fmtDur(to - from)}</div>
    </div>
  );
}

function Block({ t, live, frac, onOpen, past }) {
  const dur = taskDur(t);
  const short = dur <= 20;
  const h = short ? undefined : Math.max(56, Math.min(260, dur * 1.15));
  return (
    <div className={cx('tl-block', short && 'short', t.done && 'done', t.frog && 'frog', t.deep && 'deep', live && 'live', past && !t.done && 'late')} style={{ minHeight: h }} onClick={onOpen}>
      <span className="tl-time tnum">{t.time}</span>
      <div className="tl-box">
        {live ? <div className="tl-live-line" style={{ top: `${Math.min(100, frac * 100)}%` }} /> : null}
        <Check checked={t.done} frog={t.frog} size={22} onChange={(v) => completeTask(t.id, v)} />
        <div className="tl-text">
          <div className="tl-title">{t.title}</div>
          {short ? null : <div className="tl-sub tnum">{t.time}–{fromMin(toMin(t.time) + dur)} · {fmtDur(dur)}{t.area ? ` · ${t.area}` : ''}</div>}
        </div>
        {short ? <span className="tl-dur tnum">{fmtDur(dur)}</span> : null}
      </div>
    </div>
  );
}

function Tails({ tails, today, settings }) {
  const updateTasks = useData((s) => s.updateTasks);
  const updateTask = useData((s) => s.updateTask);
  const tasks = useData((s) => s.tasks);
  const old = tails.filter((t) => diffDays(t.date, today) > 7);
  const allToToday = () => {
    const after = timeScale(tasksForDate(tasks, today).concat(tails), settings);
    if (after.over && !window.confirm(`День станет перегружен: ${Math.round(after.ratio * 100)}% от доступного времени. Всё равно перенести?`)) return;
    updateTasks(tails.map((t) => t.id), { date: today });
    toast(`${tasksWord(tails.length)} на сегодня`);
  };
  return (
    <Section title="Хвосты" count={tails.length} className="tails" right={<button className="btn ghost sm" onClick={allToToday}>Все на сегодня</button>}>
      {old.length ? (
        <div className="banner">
          <span className="grow">{tasksWord(old.length)} {old.length === 1 ? 'висит' : 'висят'} больше недели. Разобрать позже?</span>
          <button className="btn soft sm" onClick={() => { updateTasks(old.map((t) => t.id), { date: null, time: null }); toast('Убрано во входящие'); }}>Во входящие</button>
        </div>
      ) : null}
      <div className="list">
        {tails.slice(0, 30).map((t) => (
          <TaskRow key={t.id} t={t} showDate actions={<button className="btn ghost sm" onClick={() => updateTask(t.id, { date: today })}>Сегодня</button>} />
        ))}
      </div>
    </Section>
  );
}

function HabitsToday({ date }) {
  const items = useData((s) => s.items);
  const toggleHabit = useData((s) => s.toggleHabit);
  const go = useUI((s) => s.go);
  const habits = useMemo(() => habitsForDay(items, date), [items, date]);
  if (!habits.length) return null;
  const doneN = habits.filter((h) => isHabitDone(items, h.id, date)).length;
  return (
    <Section title="Привычки" count={`${doneN}/${habits.length}`} right={<button className="btn ghost sm" onClick={() => go('growth', 'habits')}>Все</button>}>
      <div className="habit-chips">
        {habits.map((h) => {
          const done = isHabitDone(items, h.id, date);
          const st = habitStreak(h.data, habitLogSet(items, h.id), todayStr());
          return (
            <button key={h.id} className={cx('habit-chip', done && 'on')} onClick={() => { toggleHabit(h.id, date); haptic(done ? 'light' : 'success'); }}>
              <span className="hc-check">{done ? <Icon name="check" size={14} stroke={2.6} /> : null}</span>
              <span className="hc-name">{h.data.name}</span>
              {st > 1 ? <span className="hc-streak"><Icon name="flame" size={12} />{st}</span> : null}
              {h.data.remind && !done ? <span className="hc-time tnum">{h.data.remind}</span> : null}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
