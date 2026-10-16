// «Спланировать день» и «Завершить день»
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { useData, useSettings } from '../store.js';
import { useUI, toast } from '../ui.js';
import { cx, tasksForDate, overdue, sortTasks, tasksWord, haptic } from '../lib.js';
import { Sheet, Bar, Check, Section, AutoText } from '../components/ui.jsx';
import { TaskMeta } from '../components/tasks.jsx';
import { todayStr, addDays, fmtHours, relDay, fmtDur, nowMin, toMin, fromMin } from '../../shared/dates.js';
import { timeScale, headScale, autoplan, taskDur, taskPoints } from '../../shared/planning.js';

function Scale({ icon, title, need, cap, hint }) {
  const r = cap ? need / cap : 0;
  const tone = r > 1 ? 'bad' : r > 0.85 ? 'warn' : 'good';
  return (
    <div className={cx('scale', tone)}>
      <div className="scale-top">
        <span className="scale-name"><Icon name={icon} size={16} />{title}</span>
        <span className="scale-val tnum">{fmtHours(need)} из {fmtHours(cap)}</span>
      </div>
      <Bar value={need} max={cap} />
      <div className="scale-hint">{hint}</div>
    </div>
  );
}

export function PlanDaySheet({ date }) {
  const tasks = useData((s) => s.tasks);
  const { updateTasks } = useData.getState();
  const settings = useSettings();
  const close = useUI((s) => s.close);
  const today = todayStr();
  const dayTasks = useMemo(() => tasksForDate(tasks, date), [tasks, date]);
  const openTasks = sortTasks(dayTasks.filter((t) => !t.done));
  const ts = timeScale(dayTasks, settings);
  const hs = headScale(dayTasks, settings);
  const [move, setMove] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  useEffect(() => { if (preview) previewRef.current?.scrollIntoView({ block: 'start' }); }, [preview]);
  const tails = date === today ? overdue(tasks, today) : [];
  const tomorrow = addDays(date, 1);

  const runAuto = () => {
    const d = new Date();
    setPreview(autoplan(dayTasks, settings, { date, today, nowM: d.getHours() * 60 + d.getMinutes() }));
  };
  const apply = () => {
    const prev = preview.proposals.map((p) => ({ id: p.id, time: tasks[p.id].time }));
    const map = Object.fromEntries(preview.proposals.map((p) => [p.id, p.time]));
    updateTasks(Object.keys(map), (t) => ({ time: map[t.id] }));
    setPreview(null);
    haptic('success');
    close();
    toast(`Расставлено: ${tasksWord(prev.length)}`, {
      label: 'Отменить',
      run: () => {
        const m = Object.fromEntries(prev.map((p) => [p.id, p.time]));
        useData.getState().updateTasks(Object.keys(m), (t) => ({ time: m[t.id] }));
      },
    }, 8000);
  };
  const doMove = () => {
    updateTasks([...move], { date: tomorrow, time: null });
    toast(`${tasksWord(move.size)} перенесено на завтра`);
    setMove(new Set());
  };
  const tailsToday = () => {
    const after = timeScale(dayTasks.concat(tails), settings);
    if (after.over && !window.confirm(`С хвостами день станет перегружен (${Math.round(after.ratio * 100)}% от доступного времени). Перенести всё равно?`)) return;
    updateTasks(tails.map((t) => t.id), { date: today });
    toast(`${tasksWord(tails.length)} на сегодня`);
  };

  return (
    <Sheet title={`Спланировать: ${relDay(date).toLowerCase()}`} wide>
      <div className="scales">
        <Scale icon="clock" title="Время" need={ts.need} cap={ts.cap}
          hint={ts.over ? `Перебор на ${fmtDur(ts.need - ts.cap)}. Перенеси что-то на завтра.` : `Длительности ×1.5 против 65% рабочего дня (${settings.dayStart}–${settings.dayEnd}).`} />
        <Scale icon="bolt" title="Голова" need={hs.need} cap={hs.cap}
          hint={hs.over ? 'Слишком много глубокой работы — мозг столько не вывезет.' : 'Глубокая работа и главное против лимита из настроек.'} />
      </div>

      {preview ? (
        <div ref={previewRef} />
      ) : null}
      {preview ? (
        <Section title="Предпросмотр автоплана">
          {!preview.proposals.length ? <div className="muted pad-s">Нечего расставлять: у всех открытых задач уже есть время.</div> : (
            <div className="preview">
              {preview.proposals.map((p) => (
                <div key={p.id} className={cx('pv-row', p.kind)}>
                  <span className="tnum pv-time">{p.time}–{fromMin(toMin(p.time) + p.dur)}</span>
                  <span className="pv-title">{p.title}</span>
                  <span className="pv-kind">{p.kind === 'frog' ? 'главное' : p.kind === 'deep' ? 'глубоко' : fmtDur(p.dur)}</span>
                </div>
              ))}
            </div>
          )}
          {preview.unplaced.length ? <div className="banner warn">Не влезло: {preview.unplaced.map((id) => tasks[id]?.title).join(', ')}. Перенеси на завтра или сократи.</div> : null}
          <div className="hint">Главное и глубокая работа — в пик энергии ({settings.peakStart}–{settings.peakEnd}), мелочи — после пика, после длинных блоков перерыв 15 минут, обед ({settings.lunchStart}–{settings.lunchEnd}) свободен.</div>
          <div className="row gap">
            <button className="btn ghost" onClick={() => setPreview(null)}>Отмена</button>
            <button className="btn primary grow" onClick={apply} disabled={!preview.proposals.length}>Применить</button>
          </div>
        </Section>
      ) : (
        <button className="btn primary block" onClick={runAuto} disabled={!openTasks.some((t) => !t.time)}>
          <Icon name="wand" size={18} />Автоплан{openTasks.some((t) => !t.time) ? '' : ' — всё уже по времени'}
        </button>
      )}

      <Section title="Перенести на завтра" count={openTasks.length || null}>
        {!openTasks.length ? <div className="muted pad-s">Открытых задач нет.</div> : (
          <>
            <div className="list">
              {openTasks.map((t) => (
                <div key={t.id} className={cx('task-row pick', move.has(t.id) && 'picked')} onClick={() => {
                  const n = new Set(move);
                  n.has(t.id) ? n.delete(t.id) : n.add(t.id);
                  setMove(n);
                }}>
                  <span className={cx('box', move.has(t.id) && 'on')}>{move.has(t.id) ? <Icon name="check" size={14} stroke={2.6} /> : null}</span>
                  <div className="task-main"><div className="task-title">{t.title}</div><TaskMeta t={t} /></div>
                  <span className="muted sm tnum nowrap">{fmtDur(taskDur(t))}</span>
                </div>
              ))}
            </div>
            <button className="btn soft block" disabled={!move.size} onClick={doMove}>
              <Icon name="arrow" size={18} />{move.size ? `Перенести ${tasksWord(move.size)}` : 'Отметь, что перенести'}
            </button>
          </>
        )}
      </Section>

      {tails.length ? (
        <Section title="Хвосты с прошлых дней" count={tails.length}>
          <button className="btn ghost block" onClick={tailsToday}>Все хвосты на сегодня</button>
        </Section>
      ) : null}
    </Sheet>
  );
}

const MOODS = ['Плохо', 'Так себе', 'Норм', 'Хорошо', 'Отлично'];
const ENERGY = ['Пусто', 'Мало', 'Средне', 'Бодро', 'Заряжен'];

export function CloseDaySheet({ date }) {
  const tasks = useData((s) => s.tasks);
  const dayItem = useData((s) => s.items['day:' + date]);
  const { updateTask, toggleTask, deleteTask, putItem } = useData.getState();
  const close = useUI((s) => s.close);
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState(dayItem?.data.mood || 0);
  const [energy, setEnergy] = useState(dayItem?.data.energy || 0);
  const [good, setGood] = useState(dayItem?.data.good || '');
  const [note, setNote] = useState(dayItem?.data.note || '');
  const dayTasks = useMemo(() => tasksForDate(tasks, date), [tasks, date]);
  const open = sortTasks(dayTasks.filter((t) => !t.done));
  const done = dayTasks.filter((t) => t.done);
  const points = done.reduce((a, t) => a + taskPoints(t), 0);
  const tomorrow = addDays(date, 1);

  const finish = () => {
    putItem('day', 'day:' + date, { date, mood: mood || null, energy: energy || null, good, note, closed: true });
    haptic('success');
    close();
    toast('День завершён. Хорошего отдыха');
  };

  return (
    <Sheet title="Завершить день" footer={(
      <div className="row gap">
        {step > 0 ? <button className="btn ghost" onClick={() => setStep(step - 1)}>Назад</button> : <span />}
        <span className="grow" />
        {step < 2 ? <button className="btn primary" onClick={() => setStep(step + 1)}>{step === 0 && open.length ? 'Дальше' : 'Дальше'}<Icon name="arrow" size={18} /></button>
          : <button className="btn primary" onClick={finish}><Icon name="check" size={18} />Завершить</button>}
      </div>
    )}>
      <div className="steps">{['Разбор', 'Состояние', 'Итог'].map((s, i) => <span key={s} className={cx(i === step && 'on', i < step && 'past')}>{i + 1}. {s}</span>)}</div>
      {step === 0 ? (
        <div className="step">
          <div className="day-sum">
            <div><b className="tnum">{done.length}</b><span>сделано</span></div>
            <div><b className="tnum">{open.length}</b><span>осталось</span></div>
            <div><b className="tnum">{points}</b><span>очков</span></div>
          </div>
          {!open.length ? <div className="banner good">Всё сделано — красота.</div> : (
            <div className="review">
              {open.map((t) => (
                <div key={t.id} className="review-row">
                  <div className="review-title">{t.title}</div>
                  <div className="review-btns">
                    <button className="btn soft sm" onClick={() => { toggleTask(t.id, true); haptic('success'); }}><Icon name="check" size={15} />Сделано</button>
                    <button className="btn ghost sm" onClick={() => updateTask(t.id, { date: tomorrow, time: null })}>Завтра</button>
                    <button className="btn ghost sm" onClick={() => updateTask(t.id, { date: null, time: null })}>Во входящие</button>
                    <button className="btn danger-ghost sm" onClick={() => deleteTask(t.id)} aria-label="Удалить"><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="step">
          <div className="label-sm">Настроение</div>
          <Rating value={mood} onChange={setMood} labels={MOODS} />
          <div className="label-sm">Энергия</div>
          <Rating value={energy} onChange={setEnergy} labels={ENERGY} />
        </div>
      ) : null}
      {step === 2 ? (
        <div className="step form">
          <div className="label-sm">Что хорошего было сегодня</div>
          <AutoText value={good} onChange={setGood} placeholder="Даже мелочь считается" minRows={3} autoFocus />
          <div className="label-sm">Заметка</div>
          <AutoText value={note} onChange={setNote} placeholder="Мысли, выводы, что поменять завтра" minRows={3} />
        </div>
      ) : null}
    </Sheet>
  );
}

function Rating({ value, onChange, labels }) {
  return (
    <div className="rating">
      {labels.map((l, i) => (
        <button key={l} className={cx('rate', value === i + 1 && 'on')} onClick={() => onChange(i + 1)}>
          <b>{i + 1}</b><span>{l}</span>
        </button>
      ))}
    </div>
  );
}
