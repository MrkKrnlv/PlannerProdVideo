// Планы: Входящие, Неделя, Месяц
import { useMemo, useState } from 'react';
import Icon from '../icons.jsx';
import { useData, useSettings } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, inbox, sortTasks, tasksForDate, liveTasks, itemsOf, tasksWord } from '../lib.js';
import { Section, Empty, Segmented, PageHead, Bar, Check } from '../components/ui.jsx';
import { TaskRow, QuickInput, completeTask } from '../components/tasks.jsx';
import { todayStr, addDays, weekDays, weekStart, WD_SHORT, parseDate, MONTHS, MONTHS_GEN, monthDays, weekday, fmtHours, pad } from '../../shared/dates.js';
import { dayLoad, taskDur, pointsByDay, streak, bestStreak, weekdayRecords, taskPoints } from '../../shared/planning.js';

export default function Plans() {
  const sub = useUI((s) => s.sub);
  const go = useUI((s) => s.go);
  const tasks = useData((s) => s.tasks);
  const inboxN = useMemo(() => inbox(tasks).filter((t) => !t.done).length, [tasks]);
  return (
    <div className="screen plans">
      <PageHead title="Планы" below={(
        <Segmented value={sub} onChange={(v) => go('plans', v)} className="head-seg" options={[
          { value: 'inbox', label: inboxN ? `Входящие ${inboxN}` : 'Входящие' },
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
        ]} />
      )} />
      <div className="content">
        {sub === 'week' ? <Week /> : sub === 'month' ? <Month /> : <Inbox />}
      </div>
    </div>
  );
}

function Inbox() {
  const tasks = useData((s) => s.tasks);
  const updateTask = useData((s) => s.updateTask);
  const [showDone, setShowDone] = useState(false);
  const list = useMemo(() => sortTasks(inbox(tasks)), [tasks]);
  const open = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);
  const today = todayStr();
  return (
    <>
      <QuickInput defaultDate={null} placeholder="Мысль или задача без даты" />
      <Section title="Входящие" count={open.length || null}>
        {!open.length ? (
          <Empty icon="inbox" title="Входящие пусты" text="Сюда попадают задачи без даты: из быстрого ввода, бота и разбора хвостов." />
        ) : (
          <div className="list">
            {open.map((t) => (
              <TaskRow key={t.id} t={t} actions={(
                <div className="row gap-s">
                  <button className="btn ghost sm" onClick={() => { updateTask(t.id, { date: today }); toast('На сегодня'); }}>Сегодня</button>
                  <button className="btn ghost sm hide-xs" onClick={() => { updateTask(t.id, { date: addDays(today, 1) }); toast('На завтра'); }}>Завтра</button>
                </div>
              )} />
            ))}
          </div>
        )}
      </Section>
      {done.length ? (
        <Section title="Сделано" count={done.length} right={<button className="btn ghost sm" onClick={() => setShowDone(!showDone)}>{showDone ? 'Скрыть' : 'Показать'}</button>}>
          {showDone ? <div className="list">{done.map((t) => <TaskRow key={t.id} t={t} />)}</div> : null}
        </Section>
      ) : null}
    </>
  );
}

function Week() {
  const tasks = useData((s) => s.tasks);
  const items = useData((s) => s.items);
  const putItem = useData((s) => s.putItem);
  const settings = useSettings();
  const { setDate, go } = useUI.getState();
  const [anchor, setAnchor] = useState(todayStr());
  const days = weekDays(anchor);
  const today = todayStr();
  const s0 = parseDate(days[0]);
  const s6 = parseDate(days[6]);
  const range = s0.getMonth() === s6.getMonth()
    ? `${s0.getDate()}–${s6.getDate()} ${MONTHS_GEN[s6.getMonth()]}`
    : `${s0.getDate()} ${MONTHS_GEN[s0.getMonth()]} – ${s6.getDate()} ${MONTHS_GEN[s6.getMonth()]}`;
  const weekTasks = liveTasks(tasks).filter((t) => t.date >= days[0] && t.date <= days[6]);
  const areas = itemsOf(items, 'area');
  const byArea = {};
  for (const t of weekTasks) {
    const k = t.area || '';
    byArea[k] = byArea[k] || { plan: 0, done: 0 };
    byArea[k].plan += taskDur(t);
    if (t.done) byArea[k].done += taskDur(t);
  }
  const areaRows = areas.map((a) => ({ name: a.data.name, color: a.data.color, goal: (a.data.goal || 0) * 60, ...(byArea[a.data.name] || { plan: 0, done: 0 }) }));
  if (byArea['']) areaRows.push({ name: 'без сферы', color: 'var(--text-3)', goal: 0, ...byArea[''] });
  const total = weekTasks.reduce((a, t) => a + taskDur(t), 0);
  const doneMin = weekTasks.filter((t) => t.done).reduce((a, t) => a + taskDur(t), 0);

  return (
    <>
      <div className="nav-row">
        <button className="icon-btn" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Прошлая неделя"><Icon name="left" /></button>
        <div className="nav-title">
          <b>{range}</b>
          <span className="muted sm">{tasksWord(weekTasks.length)} · {fmtHours(total)} · сделано {fmtHours(doneMin)}</span>
        </div>
        <button className="icon-btn" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Следующая неделя"><Icon name="right" /></button>
      </div>

      <Section title="Баланс по сферам">
        {!areaRows.length ? <div className="muted pad-s">Добавь сферы через #сфера в быстром вводе или в «Рост → Сферы».</div> : (
          <div className="card balance">
            {areaRows.map((a) => (
              <div key={a.name} className="bal-row">
                <span className="bal-name"><i className="dot" style={{ background: a.color }} />{a.name}</span>
                <div className="bal-bar"><Bar value={a.plan} max={Math.max(a.goal, a.plan, 60)} tone="accent" marker={a.goal ? a.goal / Math.max(a.goal, a.plan, 60) : null} /></div>
                <span className="bal-val tnum">{fmtHours(a.plan)}{a.goal ? <span className="muted"> / {fmtHours(a.goal)}</span> : null}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="week-days">
        {days.map((d) => {
          const list = sortTasks(tasksForDate(tasks, d));
          const load = dayLoad(list, settings);
          const dayIt = items['day:' + d];
          const light = !!(dayIt && !dayIt.deleted && dayIt.data.light);
          const pct = Math.round(load.ratio * 100);
          const suggest = !light && pct < 50 && d >= today;
          return (
            <div key={d} className={cx('wday card', d === today && 'today', light && 'light')}>
              <div className="wday-head" onClick={() => { setDate(d); go('today'); }}>
                <div className="wday-date">
                  <b>{WD_SHORT[weekday(d) - 1]}</b>
                  <span>{parseDate(d).getDate()} {MONTHS_GEN[parseDate(d).getMonth()]}</span>
                </div>
                <div className="wday-load">
                  <Bar value={load.min} max={load.cap} />
                  <span className="tnum sm muted">{pct}%</span>
                </div>
              </div>
              <div className="wday-tags">
                <button className={cx('chip sm', light && 'on')} onClick={() => putItem('day', 'day:' + d, { date: d, light: !light })}>
                  <Icon name="coffee" size={13} />{light ? 'Лёгкий день' : 'Сделать лёгким'}
                </button>
                {suggest && list.length ? <span className="hint inline">Загрузка {pct}% — подходит для лёгкого дня</span> : null}
              </div>
              {list.length ? (
                <div className="wday-list">
                  {list.slice(0, 8).map((t) => (
                    <div key={t.id} className={cx('wl-row', t.done && 'done', t.frog && 'frog')} onClick={() => useUI.getState().open('task', { id: t.id })}>
                      <Check size={18} checked={t.done} frog={t.frog} onChange={(v) => completeTask(t.id, v)} />
                      <span className="wl-title">{t.title}</span>
                      {t.time ? <span className="tnum sm muted">{t.time}</span> : null}
                    </div>
                  ))}
                  {list.length > 8 ? <div className="muted sm pad-s">и ещё {list.length - 8}</div> : null}
                </div>
              ) : <div className="muted sm wday-empty">Пусто</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Month() {
  const tasks = useData((s) => s.tasks);
  const settings = useSettings();
  const { setDate, go } = useUI.getState();
  const today = todayStr();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const days = monthDays(ym);
  const all = useMemo(() => liveTasks(tasks), [tasks]);
  const pts = useMemo(() => pointsByDay(all), [all]);
  const monthTasks = all.filter((t) => t.date && t.date.startsWith(ym));
  const monthPts = monthTasks.reduce((a, t) => a + taskPoints(t), 0);
  const doneN = monthTasks.filter((t) => t.done).length;
  const rec = useMemo(() => weekdayRecords(all), [all]);
  const maxRec = Math.max(1, ...rec.map((r) => r.points));
  const shift = (k) => {
    const d = new Date(y, m - 1 + k, 1);
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const lead = weekday(days[0]) - 1;
  const best = Math.max(0, ...days.map((d) => pts[d] || 0));

  return (
    <>
      <div className="nav-row">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Прошлый месяц"><Icon name="left" /></button>
        <div className="nav-title"><b>{MONTHS[m - 1]} {y}</b><span className="muted sm">{tasksWord(monthTasks.length)}</span></div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Следующий месяц"><Icon name="right" /></button>
      </div>
      <div className="stats">
        <div className="stat card"><b className="tnum">{monthPts}</b><span>очков</span></div>
        <div className="stat card"><b className="tnum">{doneN}</b><span>сделано</span></div>
        <div className="stat card"><b className="tnum">{streak(all, today)}</b><span>серия, дней</span></div>
        <div className="stat card"><b className="tnum">{bestStreak(all)}</b><span>лучшая серия</span></div>
      </div>
      <div className="card month">
        <div className="mgrid">
          {WD_SHORT.map((w) => <div key={w} className="mg-wd">{w}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={'e' + i} />)}
          {days.map((d) => {
            const list = tasksForDate(tasks, d);
            const load = dayLoad(list, settings).ratio;
            const p = pts[d] || 0;
            return (
              <button key={d} className={cx('mg-day', d === today && 'today', d < today && 'past', p && p === best && 'best')} onClick={() => { setDate(d); go('today'); }}
                style={{ '--load': Math.min(1, load).toFixed(2) }}>
                <span className="mg-n">{parseDate(d).getDate()}</span>
                {p ? <span className="mg-p tnum">{p}</span> : list.length ? <span className="mg-c tnum">{list.length}</span> : null}
                <span className="mg-load" />
              </button>
            );
          })}
        </div>
        <div className="mg-legend">
          <span><i className="lg l1" />загрузка</span>
          <span><b className="tnum">25</b> очки за день</span>
        </div>
      </div>
      <Section title="Очки">
        <div className="card points-help">
          <div><b>10</b> задача до 30 мин</div>
          <div><b>25</b> до 90 мин</div>
          <div><b>30</b> дольше</div>
          <div className="frog-t"><b>40</b> главное дня</div>
        </div>
      </Section>
      <Section title="Рекорды по дням недели">
        <div className="card records">
          {rec.map((r, i) => (
            <div key={i} className="rec">
              <div className="rec-bar"><div style={{ height: `${(r.points / maxRec) * 100}%` }} /></div>
              <b className="tnum">{r.points || '—'}</b>
              <span>{WD_SHORT[i]}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
