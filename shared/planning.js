// Логика планирования: нагрузка, автоплан, очки, серии, повторы.
import { toMin, fromMin, addDays, weekday, todayStr, diffDays } from './dates.js';
import { nextRepeatDate } from './parse.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  dayStart: '09:00',
  dayEnd: '19:00',
  peakStart: '10:00',
  peakEnd: '13:00',
  lunchStart: '13:00',
  lunchEnd: '14:00',
  headLimitH: 4,
  defaultDur: 30,
  tz: 'Europe/Moscow',
};

export const DEFAULT_DUR = 30;
export const taskDur = (t) => (t && t.duration_min > 0 ? t.duration_min : DEFAULT_DUR);

export function workMinutes(s = DEFAULT_SETTINGS) {
  return Math.max(60, toMin(s.dayEnd || '19:00') - toMin(s.dayStart || '09:00'));
}

// Шкала «Время»: сумма длительностей открытых задач ×1.5 против 65% рабочего дня
export function timeScale(tasks, s = DEFAULT_SETTINGS) {
  const open = tasks.filter((t) => !t.done && !t.deleted);
  const need = Math.round(open.reduce((a, t) => a + taskDur(t), 0) * 1.5);
  const cap = Math.round(workMinutes(s) * 0.65);
  return { need, cap, ratio: cap ? need / cap : 0, over: need > cap };
}

// Шкала «Голова»: глубокая работа и главное против лимита
export function headScale(tasks, s = DEFAULT_SETTINGS) {
  const open = tasks.filter((t) => !t.done && !t.deleted && (t.deep || t.frog));
  const need = open.reduce((a, t) => a + taskDur(t), 0);
  const cap = Math.round((Number(s.headLimitH) || 4) * 60);
  return { need, cap, ratio: cap ? need / cap : 0, over: need > cap };
}

// Загрузка дня (для недели/месяца): все задачи дня (и сделанные) против рабочего дня
export function dayLoad(tasks, s = DEFAULT_SETTINGS) {
  const live = tasks.filter((t) => !t.deleted);
  const min = live.reduce((a, t) => a + taskDur(t), 0);
  const cap = workMinutes(s);
  return { min, cap, ratio: cap ? min / cap : 0 };
}

// ——— Автоплан ———
function freeGaps(busy, from, to) {
  const b = busy.filter(([a, z]) => z > from && a < to).sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let cur = from;
  for (const [a, z] of b) {
    if (a > cur) gaps.push([cur, Math.min(a, to)]);
    cur = Math.max(cur, z);
    if (cur >= to) break;
  }
  if (cur < to) gaps.push([cur, to]);
  return gaps;
}

function findSlot(busy, dur, from, to, notBefore = from) {
  for (const [a, z] of freeGaps(busy, from, to)) {
    const st = Math.max(a, notBefore);
    const rounded = Math.ceil(st / 5) * 5;
    if (rounded + dur <= z) return rounded;
  }
  return null;
}

const BREAK_AFTER = 15; // минут перерыва после блока от 45 минут

export function autoplan(dayTasks, s = DEFAULT_SETTINGS, { date, today = todayStr(), nowM = null } = {}) {
  const st = toMin(s.dayStart || '09:00');
  const en = toMin(s.dayEnd || '19:00');
  const peakS = toMin(s.peakStart || '10:00');
  const peakE = toMin(s.peakEnd || '13:00');
  const lunchS = toMin(s.lunchStart || '13:00');
  const lunchE = toMin(s.lunchEnd || '14:00');
  let from = st;
  if (date === today && nowM != null) from = Math.max(st, Math.ceil(nowM / 5) * 5);

  const live = dayTasks.filter((t) => !t.deleted);
  const busy = [];
  for (const t of live) {
    if (t.time) {
      const a = toMin(t.time);
      busy.push([a, a + taskDur(t) + (taskDur(t) >= 45 && (t.deep || t.frog) ? BREAK_AFTER : 0)]);
    }
  }
  if (lunchE > lunchS) busy.push([lunchS, lunchE]);

  const todo = live.filter((t) => !t.done && !t.time);
  const heavy = todo.filter((t) => t.frog || t.deep)
    .sort((a, b) => (b.frog ? 1 : 0) - (a.frog ? 1 : 0) || (a.priority || 2) - (b.priority || 2) || taskDur(b) - taskDur(a));
  const light = todo.filter((t) => !t.frog && !t.deep)
    .sort((a, b) => (a.priority || 2) - (b.priority || 2) || taskDur(a) - taskDur(b));

  const proposals = [];
  const unplaced = [];
  const place = (t, at) => {
    const d = taskDur(t);
    proposals.push({ id: t.id, time: fromMin(at), title: t.title, dur: d, kind: t.frog ? 'frog' : t.deep ? 'deep' : 'light' });
    busy.push([at, at + d + (d >= 45 && (t.frog || t.deep) ? BREAK_AFTER : 0)]);
  };

  for (const t of heavy) {
    const d = taskDur(t);
    let at = findSlot(busy, d, Math.max(from, peakS), Math.max(peakE, Math.min(en, peakS + d)));
    if (at == null) at = findSlot(busy, d, from, en);
    if (at == null) unplaced.push(t.id); else place(t, at);
  }
  const slotFrom = { morning: st, afternoon: Math.max(12 * 60, st), evening: Math.max(17 * 60, st) };
  for (const t of light) {
    const d = taskDur(t);
    let at = null;
    if (t.slot && slotFrom[t.slot] != null && t.slot !== 'anytime') {
      at = findSlot(busy, d, Math.max(from, slotFrom[t.slot]), en);
    }
    if (at == null) at = findSlot(busy, d, Math.max(from, peakE), en);
    if (at == null) at = findSlot(busy, d, from, en);
    if (at == null) unplaced.push(t.id); else place(t, at);
  }
  proposals.sort((a, b) => toMin(a.time) - toMin(b.time));
  return { proposals, unplaced };
}

// ——— Очки ———
export function taskPoints(t) {
  if (!t || !t.done || t.deleted) return 0;
  if (t.frog) return 40;
  const d = taskDur(t);
  if (d <= 30) return 10;
  if (d <= 90) return 25;
  return 30;
}

export function pointsByDay(tasks) {
  const m = {};
  for (const t of tasks) {
    if (!t.done || t.deleted || !t.date) continue;
    m[t.date] = (m[t.date] || 0) + taskPoints(t);
  }
  return m;
}

// Серия: подряд идущие дни с хотя бы одной сделанной задачей.
// Если сегодня ещё ничего не сделано — серия считается до вчера.
export function streak(tasks, today = todayStr()) {
  const days = new Set(tasks.filter((t) => t.done && !t.deleted && t.date).map((t) => t.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak(tasks) {
  const days = [...new Set(tasks.filter((t) => t.done && !t.deleted && t.date).map((t) => t.date))].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) {
    cur = prev && diffDays(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

// Рекорды по дням недели: лучший день по очкам для каждого дня недели
export function weekdayRecords(tasks) {
  const pts = pointsByDay(tasks);
  const rec = Array.from({ length: 7 }, () => ({ points: 0, date: null }));
  for (const [d, p] of Object.entries(pts)) {
    const w = weekday(d) - 1;
    if (p > rec[w].points) rec[w] = { points: p, date: d };
  }
  return rec;
}

// ——— Повторы ———
// Возвращает новую задачу-продолжение или null
export function spawnNext(task, newId, now = Date.now(), today = todayStr()) {
  const rep = task.repeat;
  if (!rep || rep.spawned) return null;
  const base = task.date || today;
  const next = nextRepeatDate(rep, base < today && rep.type !== 'monthly' ? addDays(today, -1) : base);
  if (!next) return null;
  const { spawned, ...cleanRep } = rep;
  return {
    ...task,
    id: newId,
    date: next,
    done: false,
    deleted: false,
    repeat: cleanRep,
    checklist: (task.checklist || []).map((c) => ({ ...c, done: false })),
    created_at: now,
    updated_at: now,
    source: task.source || 'app',
  };
}

// Привычка запланирована на день?
export function habitDue(h, date) {
  const days = h.days && h.days.length ? h.days : [1, 2, 3, 4, 5, 6, 7];
  if (h.start && date < h.start) return false;
  return days.includes(weekday(date));
}

export function habitStreak(h, logs, today = todayStr()) {
  // logs: Set дат, когда отмечено
  let d = logs.has(today) ? today : addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (!habitDue(h, d)) { d = addDays(d, -1); continue; }
    if (!logs.has(d)) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const habitLogId = (habitId, date) => `hl:${habitId}:${date}`;
