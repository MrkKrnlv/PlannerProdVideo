import { todayStr, diffDays, toMin, weekday } from '../shared/dates.js';
import { habitDue, habitLogId, taskDur } from '../shared/planning.js';

export function uid(prefix = '') {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Date.now().toString(36).slice(-5) + [...a].map((x) => (x % 36).toString(36)).join('');
}

export const cx = (...a) => a.filter(Boolean).join(' ');

export const liveTasks = (tasks) => Object.values(tasks).filter((t) => !t.deleted);

export function tasksForDate(tasks, date) {
  return liveTasks(tasks).filter((t) => t.date === date);
}

export function sortTasks(list) {
  return [...list].sort((a, b) =>
    (a.done ? 1 : 0) - (b.done ? 1 : 0)
    || (b.frog ? 1 : 0) - (a.frog ? 1 : 0)
    || (toMin(a.time) ?? 9999) - (toMin(b.time) ?? 9999)
    || (a.priority || 2) - (b.priority || 2)
    || (a.created_at || 0) - (b.created_at || 0));
}

export function overdue(tasks, today = todayStr()) {
  return liveTasks(tasks).filter((t) => !t.done && t.date && t.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function inbox(tasks) {
  return liveTasks(tasks).filter((t) => !t.date);
}

export const itemsOf = (items, kind) => Object.values(items).filter((i) => i.kind === kind && !i.deleted);

export function habitLogSet(items, habitId) {
  const s = new Set();
  for (const i of Object.values(items)) {
    if (i.kind === 'habit_log' && !i.deleted && i.data.habit === habitId) s.add(i.data.date);
  }
  return s;
}

export function habitsForDay(items, date) {
  return itemsOf(items, 'habit').filter((h) => !h.data.archived && habitDue(h.data, date))
    .sort((a, b) => (a.data.remind || '99').localeCompare(b.data.remind || '99') || (a.data.order || 0) - (b.data.order || 0));
}

export const isHabitDone = (items, habitId, date) => {
  const l = items[habitLogId(habitId, date)];
  return !!(l && !l.deleted);
};

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const tasksWord = (n) => `${n} ${plural(n, 'задача', 'задачи', 'задач')}`;

export function haptic(kind = 'light') {
  try {
    const h = window.Telegram?.WebApp?.HapticFeedback;
    if (h) {
      if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
      else h.impactOccurred(kind);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [10, 30, 10] : 8);
  } catch { /* не критично */ }
}

export function areaColor(items, name) {
  if (!name) return null;
  const a = itemsOf(items, 'area').find((x) => x.data.name === name);
  return a ? a.data.color : null;
}

export const AREA_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#22c55e', '#ef4444'];

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export { taskDur, weekday, diffDays };
