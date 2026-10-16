// Даты в формате 'YYYY-MM-DD', время 'HH:MM'. Всё в локальном времени устройства.
export const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function todayStr(now = new Date()) {
  return toDateStr(now);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(a, b) {
  // b - a в днях
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// 1 = понедельник ... 7 = воскресенье
export function weekday(s) {
  const w = parseDate(s).getDay();
  return w === 0 ? 7 : w;
}

export function weekStart(s) {
  return addDays(s, 1 - weekday(s));
}

export function weekDays(s) {
  const st = weekStart(s);
  return Array.from({ length: 7 }, (_, i) => addDays(st, i));
}

export function monthDays(ym) {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
}

export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const WD_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export function fmtDate(s, { weekday: wd = false, year = false } = {}) {
  if (!s) return 'Без даты';
  const d = parseDate(s);
  let r = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (year) r += ` ${d.getFullYear()}`;
  if (wd) r += `, ${WD_SHORT[weekday(s) - 1]}`;
  return r;
}

export function fmtDateShort(s) {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function relDay(s, today = todayStr()) {
  const n = diffDays(today, s);
  if (n === 0) return 'Сегодня';
  if (n === 1) return 'Завтра';
  if (n === -1) return 'Вчера';
  if (n === 2) return 'Послезавтра';
  return fmtDate(s, { weekday: true });
}

export function toMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(m) {
  m = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nowMin(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

export function fmtDur(min) {
  if (!min && min !== 0) return '';
  min = Math.round(min);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

export function fmtHours(min) {
  const h = min / 60;
  return `${Math.round(h * 10) / 10}`.replace('.', ',') + ' ч';
}

// Дата в часовом поясе (для сервера: Europe/Moscow)
export function zonedParts(tz, now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

export function slotOf(time) {
  const m = toMin(time);
  if (m == null) return 'anytime';
  if (m < 12 * 60) return 'morning';
  if (m < 17 * 60) return 'afternoon';
  return 'evening';
}

export const SLOT_NAMES = { morning: 'Утро', afternoon: 'День', evening: 'Вечер', anytime: 'В любое время' };
