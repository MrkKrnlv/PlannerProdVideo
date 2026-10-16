// Рост: Привычки, Сферы, цикл 12 недель
import { useMemo, useState } from 'react';
import Icon from '../icons.jsx';
import { useData } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, itemsOf, habitLogSet, liveTasks, haptic, uid } from '../lib.js';
import { Section, Empty, Segmented, PageHead, Bar, Check, Field } from '../components/ui.jsx';
import { DateField } from '../components/pickers.jsx';
import { todayStr, addDays, WD_SHORT, parseDate, weekday, weekStart, monthDays, fmtHours, fmtDate, diffDays } from '../../shared/dates.js';
import { habitDue, habitStreak, taskDur } from '../../shared/planning.js';
import { repeatLabel } from '../../shared/parse.js';

export default function Growth() {
  const sub = useUI((s) => s.sub);
  const go = useUI((s) => s.go);
  return (
    <div className="screen growth">
      <PageHead title="Рост" below={(
        <Segmented value={sub} onChange={(v) => go('growth', v)} className="head-seg" options={[
          { value: 'habits', label: 'Привычки' },
          { value: 'areas', label: 'Сферы' },
          { value: 'cycle', label: '12 недель' },
        ]} />
      )} />
      <div className="content">
        {sub === 'areas' ? <Areas /> : sub === 'cycle' ? <Cycle /> : <Habits />}
      </div>
    </div>
  );
}

function daysLabel(days) {
  if (!days || days.length === 7) return 'каждый день';
  if (days.join() === '1,2,3,4,5') return 'по будням';
  if (days.join() === '6,7') return 'по выходным';
  return days.map((d) => WD_SHORT[d - 1]).join(', ');
}

function Habits() {
  const items = useData((s) => s.items);
  const toggleHabit = useData((s) => s.toggleHabit);
  const open = useUI((s) => s.open);
  const today = todayStr();
  const habits = itemsOf(items, 'habit').sort((a, b) => (a.data.archived ? 1 : 0) - (b.data.archived ? 1 : 0) || (a.data.created || 0) - (b.data.created || 0));
  const grid = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const month = monthDays(today.slice(0, 7)).filter((d) => d <= today);
  if (!habits.length) {
    return <Empty icon="flame" title="Пока нет привычек" text="Маленькие ежедневные действия — зарядка, чтение, вода. Добавь первую." action={<button className="btn primary" onClick={() => open('add', { tab: 'habit' })}><Icon name="plus" size={18} />Привычка</button>} />;
  }
  return (
    <>
      <div className="habits">
        {habits.map((h) => {
          const logs = habitLogSet(items, h.id);
          const due = month.filter((d) => habitDue(h.data, d));
          const pct = due.length ? Math.round((due.filter((d) => logs.has(d)).length / due.length) * 100) : 0;
          const st = habitStreak(h.data, logs, today);
          const doneToday = logs.has(today);
          return (
            <div key={h.id} className={cx('habit card', h.data.archived && 'archived')}>
              <div className="habit-top">
                <Check size={28} checked={doneToday} onChange={() => { toggleHabit(h.id, today); haptic(doneToday ? 'light' : 'success'); }} label="Сегодня" />
                <div className="habit-info" onClick={() => open('habit', { id: h.id })}>
                  <div className="habit-name">{h.data.name}</div>
                  <div className="muted sm">{daysLabel(h.data.days)}{h.data.remind ? ` · напомню в ${h.data.remind}` : ''}{h.data.archived ? ' · в архиве' : ''}</div>
                </div>
                <div className="habit-nums">
                  <div><b className="tnum"><Icon name="flame" size={13} />{st}</b><span>серия</span></div>
                  <div><b className="tnum">{pct}%</b><span>месяц</span></div>
                </div>
              </div>
              <div className="hgrid">
                {grid.map((d) => {
                  const isDue = habitDue(h.data, d);
                  const on = logs.has(d);
                  return (
                    <button key={d} title={fmtDate(d, { weekday: true })} className={cx('hcell', on && 'on', !isDue && 'off', d === today && 'today')}
                      onClick={() => toggleHabit(h.id, d)}>
                      <span>{parseDate(d).getDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn soft block" onClick={() => open('add', { tab: 'habit' })}><Icon name="plus" size={18} />Новая привычка</button>
    </>
  );
}

function Areas() {
  const items = useData((s) => s.items);
  const tasks = useData((s) => s.tasks);
  const open = useUI((s) => s.open);
  const today = todayStr();
  const ws = weekStart(today);
  const areas = itemsOf(items, 'area');
  const all = useMemo(() => liveTasks(tasks), [tasks]);
  if (!areas.length) {
    return <Empty icon="layers" title="Сфер пока нет" text="Сферы — это направления жизни: работа, здоровье, учёба. Ставь недельную цель в часах и смотри баланс." action={<button className="btn primary" onClick={() => open('area', {})}><Icon name="plus" size={18} />Сфера</button>} />;
  }
  return (
    <>
      <div className="areas">
        {areas.map((a) => {
          const name = a.data.name;
          const mine = all.filter((t) => t.area === name);
          const weekDone = mine.filter((t) => t.done && t.date >= ws && t.date <= addDays(ws, 6)).reduce((s, t) => s + taskDur(t), 0);
          const weekPlan = mine.filter((t) => t.date >= ws && t.date <= addDays(ws, 6)).reduce((s, t) => s + taskDur(t), 0);
          const last7 = mine.filter((t) => t.done && t.date > addDays(today, -7) && t.date <= today).reduce((s, t) => s + taskDur(t), 0);
          const goal = (a.data.goal || 0) * 60;
          const forgotten = last7 === 0;
          return (
            <div key={a.id} className="area card" onClick={() => open('area', { id: a.id })}>
              <div className="area-top">
                <span className="area-dot" style={{ background: a.data.color }} />
                <div className="grow">
                  <div className="area-name">{name}{forgotten ? <span className="tag warn">забыта</span> : null}</div>
                  <div className="muted sm">{goal ? `цель ${fmtHours(goal)} в неделю` : 'без цели'} · запланировано {fmtHours(weekPlan)}</div>
                </div>
                <div className="area-val tnum"><b>{fmtHours(weekDone)}</b>{goal ? <span className="muted"> / {fmtHours(goal)}</span> : null}</div>
              </div>
              <Bar value={weekDone} max={goal || Math.max(weekPlan, 60)} tone={goal && weekDone >= goal ? 'good' : 'accent'} />
              {forgotten ? <div className="hint">0 часов за последние 7 дней — запланируй хотя бы одно дело.</div> : null}
            </div>
          );
        })}
      </div>
      <button className="btn soft block" onClick={() => open('area', {})}><Icon name="plus" size={18} />Новая сфера</button>
    </>
  );
}

// ——— Цикл 12 недель ———
function Cycle() {
  const items = useData((s) => s.items);
  const { putItem, deleteItem } = useData.getState();
  const today = todayStr();
  const plan = itemsOf(items, 'plan').filter((p) => !p.data.closed).sort((a, b) => (b.data.start || '').localeCompare(a.data.start || ''))[0];
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(weekStart(today));
  const [goalText, setGoalText] = useState('');
  const [tacticFor, setTacticFor] = useState(null);
  const [tacticText, setTacticText] = useState('');

  if (!plan) {
    return (
      <div className="card form cycle-new">
        <h3>Цикл 12 недель</h3>
        <p className="muted">Год слишком длинный, чтобы чувствовать дедлайн. 12 недель — достаточно, чтобы сделать большое, и достаточно мало, чтобы не расслабляться. Ставишь 1–3 цели, раскладываешь на еженедельные шаги и следишь за % выполнения. 85% — уже отличный результат.</p>
        <Field label="Название цикла"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Осень: запуск продукта" /></Field>
        <DateField label="Начало" value={start} onChange={(d) => setStart(d ? weekStart(d) : weekStart(today))} allowEmpty={false} />
        <button className="btn primary block" onClick={() => putItem('plan', null, { title: title.trim() || 'Мой цикл', start })}>Начать цикл</button>
      </div>
    );
  }

  const week = Math.floor(diffDays(plan.data.start, today) / 7) + 1;
  const curWeek = Math.min(12, Math.max(1, week));
  const goals = itemsOf(items, 'goal').filter((g) => g.data.plan === plan.id).sort((a, b) => (a.data.created || 0) - (b.data.created || 0));
  const tactics = itemsOf(items, 'tactic').filter((t) => goals.some((g) => g.id === t.data.goal));
  const logDone = (tid, w) => { const l = items[`tl:${tid}:${w}`]; return !!(l && !l.deleted); };
  const weekPct = (w) => {
    const planned = tactics.filter((t) => (t.data.fromWeek || 1) <= w);
    if (!planned.length) return null;
    return planned.filter((t) => logDone(t.id, w)).length / planned.length;
  };
  const toggleLog = (tid, w) => {
    const id = `tl:${tid}:${w}`;
    const l = items[id];
    if (l && !l.deleted) deleteItem(id); else putItem('tactic_log', id, { tactic: tid, week: w }, { replace: true });
    haptic('light');
  };
  const avg = (() => {
    const vals = Array.from({ length: Math.min(curWeek, 12) }, (_, i) => weekPct(i + 1)).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();
  const endDate = addDays(plan.data.start, 83);

  return (
    <>
      <div className="card cycle-head">
        <div className="row">
          <div className="grow">
            <div className="cycle-title">{plan.data.title}</div>
            <div className="muted sm">{fmtDate(plan.data.start)} — {fmtDate(endDate)}</div>
          </div>
          <div className="cycle-week"><b className="tnum">{week > 12 ? 'итог' : `${curWeek}/12`}</b><span>неделя</span></div>
        </div>
        <div className="wchart" role="img" aria-label="Выполнение по неделям">
          <div className="wc-line" style={{ bottom: '85%' }}><span>85%</span></div>
          {Array.from({ length: 12 }, (_, i) => {
            const v = weekPct(i + 1);
            const fut = i + 1 > curWeek;
            return (
              <div key={i} className={cx('wc-col', i + 1 === curWeek && 'cur', fut && 'fut')}>
                <div className={cx('wc-bar', v != null && v >= 0.85 && 'ok')} style={{ height: `${fut || v == null ? 0 : Math.max(3, v * 100)}%` }} />
                <span>{i + 1}</span>
              </div>
            );
          })}
        </div>
        <div className="row sm muted">
          <span className="grow">Эта неделя: <b className="tnum">{weekPct(curWeek) == null ? '—' : Math.round(weekPct(curWeek) * 100) + '%'}</b></span>
          <span>В среднем: <b className="tnum">{avg == null ? '—' : Math.round(avg * 100) + '%'}</b></span>
        </div>
      </div>

      <Section title={`Шаги недели ${curWeek}`} count={tactics.length ? `${tactics.filter((t) => (t.data.fromWeek || 1) <= curWeek && logDone(t.id, curWeek)).length}/${tactics.filter((t) => (t.data.fromWeek || 1) <= curWeek).length}` : null}>
        {!goals.length ? <div className="muted pad-s">Добавь цель ниже, а к ней — еженедельные шаги.</div> : null}
        {goals.map((g) => {
          const ts = tactics.filter((t) => t.data.goal === g.id);
          return (
            <div key={g.id} className="card goal">
              <div className="goal-head">
                <Icon name="target" size={18} />
                <span className="goal-title grow">{g.data.title}</span>
                <button className="icon-btn sm" onClick={() => { if (window.confirm('Удалить цель вместе с шагами?')) { ts.forEach((t) => deleteItem(t.id)); deleteItem(g.id); } }} aria-label="Удалить цель"><Icon name="trash" size={16} /></button>
              </div>
              {ts.map((t) => (
                <div key={t.id} className={cx('tactic', logDone(t.id, curWeek) && 'done')}>
                  <Check size={22} checked={logDone(t.id, curWeek)} onChange={() => toggleLog(t.id, curWeek)} />
                  <span className="grow">{t.data.title}</span>
                  <button className="icon-btn sm" onClick={() => deleteItem(t.id)} aria-label="Удалить шаг"><Icon name="x" size={15} /></button>
                </div>
              ))}
              {tacticFor === g.id ? (
                <form className="row gap" onSubmit={(e) => {
                  e.preventDefault();
                  if (!tacticText.trim()) return;
                  putItem('tactic', null, { goal: g.id, title: tacticText.trim(), fromWeek: curWeek, created: Date.now() });
                  setTacticText('');
                }}>
                  <input className="input" autoFocus value={tacticText} onChange={(e) => setTacticText(e.target.value)} placeholder="Шаг каждую неделю: 3 тренировки" />
                  <button className="btn soft" type="submit">OK</button>
                </form>
              ) : <button className="btn ghost sm" onClick={() => { setTacticFor(g.id); setTacticText(''); }}><Icon name="plus" size={15} />Шаг</button>}
            </div>
          );
        })}
        <form className="row gap" onSubmit={(e) => {
          e.preventDefault();
          if (!goalText.trim()) return;
          putItem('goal', null, { plan: plan.id, title: goalText.trim(), created: Date.now() });
          setGoalText('');
        }}>
          <input className="input" value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="Новая цель на 12 недель" />
          <button className="btn soft" type="submit" disabled={!goalText.trim()}>Добавить</button>
        </form>
      </Section>
      <div className="row"><span className="grow" /><button className="btn ghost sm" onClick={() => { if (window.confirm('Завершить цикл и начать новый?')) putItem('plan', plan.id, { closed: true }); }}>Новый цикл</button></div>
    </>
  );
}
