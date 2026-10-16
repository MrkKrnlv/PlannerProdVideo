// Разбор быстрого ввода: «созвон 1.5ч в 16:00 завтра #работа !»
import { addDays, todayStr, toDateStr, parseDate, weekday, pad, diffDays, slotOf, nowMin, fromMin, fmtDur, fmtDate, WD_SHORT } from './dates.js';

const END = '(?=$|[\\s,.;:!?)])';
const START = '(?:^|(?<=[\\s(,]))';

const WD_PATTERNS = [
  'понедельник\\p{L}*|пн',
  'вторник\\p{L}*|вт',
  'сред[аеуы]\\p{L}*|ср',
  'четверг\\p{L}*|чт',
  'пятниц\\p{L}*|пт',
  'суббот\\p{L}*|сб',
  'воскресень\\p{L}*|вс',
];
const WD_ANY = WD_PATTERNS.map((p) => `(?:${p})`).join('|');

function wdIndex(word) {
  const w = word.toLowerCase();
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`^(?:${WD_PATTERNS[i]})$`, 'u').test(w)) return i + 1;
  }
  return null;
}

const MONTH_STEMS = ['янв', 'фев', 'мар', 'апр', 'ма[яй]', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTH_RE = MONTH_STEMS.map((s) => `${s}\\p{L}*`).join('|');

function monthIndex(word) {
  const w = word.toLowerCase();
  for (let i = 0; i < 12; i++) if (new RegExp(`^${MONTH_STEMS[i]}`, 'u').test(w)) return i;
  return -1;
}

function validDate(y, m, d) {
  const dt = new Date(y, m, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
}

function num(s) {
  return Number(String(s).replace(',', '.'));
}

export function parseQuick(input, opts = {}) {
  const today = opts.today || todayStr();
  const now = opts.nowMin ?? nowMin();
  let s = ` ${String(input || '').replace(/\s+/g, ' ').trim()} `;
  const r = {
    title: '', date: undefined, time: null, duration_min: null, slot: null,
    area: null, priority: 2, frog: false, deep: false, repeat: null,
  };

  const take = (re, fn) => {
    s = s.replace(re, (...m) => {
      const res = fn(...m);
      return res === false ? m[0] : ' ';
    });
  };

  // Приоритеты: !! главное, ! важно, ~ не срочно
  take(new RegExp(`${START}!{2,}${END}`, 'gu'), () => { r.frog = true; r.priority = 1; });
  take(/(?<=\S)!{2,}(?=\s*$)/gu, () => { r.frog = true; r.priority = 1; });
  take(new RegExp(`${START}!${END}`, 'gu'), () => { r.priority = 1; });
  take(new RegExp(`${START}~${END}`, 'gu'), () => { if (!r.frog) r.priority = 3; });

  // #сфера
  take(/#([\p{L}\p{N}_-]+)/gu, (_, a) => {
    if (/^(deep|глубоко|фокус)$/iu.test(a)) { r.deep = true; return; }
    r.area = a.toLowerCase();
  });

  // Повторы
  take(new RegExp(`${START}(?:каждый\\s+день|ежедневно|каждое\\s+утро|каждый\\s+вечер)${END}`, 'giu'), (m) => {
    r.repeat = { type: 'daily' };
    if (/утро/i.test(m)) r.slot = 'morning';
    if (/вечер/i.test(m)) r.slot = 'evening';
  });
  take(new RegExp(`${START}(?:по\\s+будням|в\\s+будни|каждый\\s+будний\\s+день)${END}`, 'giu'), () => { r.repeat = { type: 'weekdays' }; });
  take(new RegExp(`${START}(?:каждую\\s+неделю|еженедельно)${END}`, 'giu'), () => { r.repeat = { type: 'weekly', days: null }; });
  take(new RegExp(`${START}(?:каждый\\s+месяц|ежемесячно)${END}`, 'giu'), () => { r.repeat = { type: 'monthly' }; });
  take(new RegExp(`${START}(?:каждый|каждую|каждое|по)\\s+((?:${WD_ANY})(?:\\s*(?:,|и)?\\s*(?:${WD_ANY}))*)${END}`, 'giu'), (_, list) => {
    const days = [...list.matchAll(new RegExp(WD_ANY, 'giu'))].map((m) => wdIndex(m[0])).filter(Boolean);
    if (!days.length) return false;
    r.repeat = { type: 'weekly', days: [...new Set(days)].sort() };
  });

  // Диапазон времени: «с 14:00 до 15:30», «14:00-15:30»
  take(new RegExp(`${START}(?:с\\s+)?(\\d{1,2}):(\\d{2})\\s*(?:-|–|до)\\s*(\\d{1,2}):(\\d{2})${END}`, 'giu'), (_, h1, m1, h2, m2) => {
    const a = +h1 * 60 + +m1;
    const b = +h2 * 60 + +m2;
    if (+h1 > 23 || +h2 > 23 || +m1 > 59 || +m2 > 59 || b <= a) return false;
    r.time = `${pad(+h1)}:${m1}`;
    r.duration_min = b - a;
  });

  // «через 2 часа», «через 30 минут» — время от текущего момента
  take(new RegExp(`${START}через\\s+(\\d+(?:[.,]\\d+)?|пол)\\s*(час\\p{L}*|ч|мин\\p{L}*|м)${END}`, 'giu'), (_, n, unit) => {
    const v = n === 'пол' ? 0.5 : num(n);
    const add = /^ч|^час/i.test(unit) ? v * 60 : v;
    let t = Math.ceil((now + add) / 5) * 5;
    if (t >= 24 * 60) { r.date = addDays(today, 1); t -= 24 * 60; } else r.date = today;
    r.time = fromMin(t);
  });
  take(new RegExp(`${START}через\\s+(\\d+|неделю|месяц)\\s*(дн\\p{L}*|день|недел\\p{L}*)?${END}`, 'giu'), (_, n, unit) => {
    if (n === 'неделю') r.date = addDays(today, 7);
    else if (n === 'месяц') { const d = parseDate(today); d.setMonth(d.getMonth() + 1); r.date = toDateStr(d); }
    else if (unit && /^недел/i.test(unit)) r.date = addDays(today, 7 * +n);
    else if (unit) r.date = addDays(today, +n);
    else return false;
  });

  // Длительность: 1.5ч, 2 часа, 30м, 45 мин, 1ч30м, полчаса
  take(new RegExp(`${START}(?:на\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(?:ч|час|часа|часов)\\s*(?:(\\d{1,2})\\s*(?:м|мин|минут|минуты)?)?${END}`, 'giu'), (_, h, m) => {
    r.duration_min = Math.round(num(h) * 60 + (m ? +m : 0));
  });
  take(new RegExp(`${START}(?:на\\s+)?(\\d+)\\s*(?:м|мин|минут|минуты|минуту)${END}`, 'giu'), (_, m) => { r.duration_min = +m; });
  take(new RegExp(`${START}(?:на\\s+)?полчаса${END}`, 'giu'), () => { r.duration_min = 30; });
  take(new RegExp(`${START}на\\s+час${END}`, 'giu'), () => { r.duration_min = 60; });
  take(new RegExp(`${START}на\\s+полтора\\s+часа${END}`, 'giu'), () => { r.duration_min = 90; });

  // Время: «в 7 вечера», «в 9 утра»
  take(new RegExp(`${START}(?:в|к)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(утра|дня|вечера|ночи)${END}`, 'giu'), (_, h, m, part) => {
    let hh = +h;
    if (hh > 12) return false;
    if (/дня|вечера/i.test(part) && hh < 12) hh += 12;
    if (/ночи/i.test(part) && hh === 12) hh = 0;
    r.time = `${pad(hh)}:${m || '00'}`;
  });
  // 16:00, в 16:00
  take(new RegExp(`${START}(?:в|к|на)?\\s*(\\d{1,2}):(\\d{2})${END}`, 'giu'), (_, h, m) => {
    if (+h > 23 || +m > 59) return false;
    r.time = `${pad(+h)}:${m}`;
  });
  // «в 16.30» — только если правая часть не может быть месяцем
  take(new RegExp(`${START}(?:в|к)\\s+(\\d{1,2})\\.(\\d{2})${END}`, 'giu'), (_, h, m) => {
    if (+m <= 12 || +h > 23 || +m > 59) return false;
    r.time = `${pad(+h)}:${m}`;
  });

  // Даты: 20.10, 20.10.2026 — это дата, не время
  take(new RegExp(`${START}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${END}`, 'giu'), (_, d, m, y) => {
    const t = parseDate(today);
    let yy = y ? (+y < 100 ? 2000 + +y : +y) : t.getFullYear();
    if (!validDate(yy, +m - 1, +d)) return false;
    let ds = `${yy}-${pad(+m)}-${pad(+d)}`;
    if (!y && diffDays(today, ds) < -7) ds = `${yy + 1}-${pad(+m)}-${pad(+d)}`;
    r.date = ds;
  });
  // 20 октября
  take(new RegExp(`${START}(\\d{1,2})\\s+(${MONTH_RE})(?:\\s+(\\d{4}))?${END}`, 'giu'), (_, d, mon, y) => {
    const mi = monthIndex(mon);
    const t = parseDate(today);
    let yy = y ? +y : t.getFullYear();
    if (mi < 0 || !validDate(yy, mi, +d)) return false;
    let ds = `${yy}-${pad(mi + 1)}-${pad(+d)}`;
    if (!y && diffDays(today, ds) < -7) ds = `${yy + 1}-${pad(mi + 1)}-${pad(+d)}`;
    r.date = ds;
  });
  take(new RegExp(`${START}(?:на\\s+)?(послезавтра|завтра|сегодня)${END}`, 'giu'), (_, w) => {
    const k = w.toLowerCase();
    r.date = addDays(today, k === 'сегодня' ? 0 : k === 'завтра' ? 1 : 2);
  });
  take(new RegExp(`${START}(?:(?:в|во|на)\\s+)?(?:(следующ\\p{L}*|эт\\p{L}*)\\s+)?(${WD_ANY})${END}`, 'giu'), (_, mod, w) => {
    const target = wdIndex(w);
    if (!target) return false;
    let delta = (target - weekday(today) + 7) % 7;
    if (mod && /^след/i.test(mod)) delta += 7;
    r.date = addDays(today, delta);
  });

  // Утром / днём / вечером
  take(new RegExp(`${START}(утром|с\\s+утра|днём|днем|вечером|ночью)${END}`, 'giu'), (_, w) => {
    const k = w.toLowerCase();
    r.slot = /утр/.test(k) ? 'morning' : /веч|ноч/.test(k) ? 'evening' : 'afternoon';
  });

  // Если время задано — слот из времени
  if (r.time) r.slot = slotOf(r.time);

  // Повтор по дням недели без даты — ближайший подходящий день
  if (r.repeat && r.date === undefined) {
    r.date = nextRepeatDate(r.repeat, addDays(today, -1)) || today;
  }
  if (r.repeat && r.repeat.type === 'weekly' && !r.repeat.days) {
    r.repeat.days = [weekday(r.date || today)];
  }

  let title = s
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)(в|во|на|к|с|до|и)(?=\s*$)/giu, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '')
    .trim();
  // убираем висячие предлоги в конце повторно
  for (let i = 0; i < 3; i++) title = title.replace(/(^|\s)(в|во|на|к|с|до|и)$/iu, '').trim();
  r.title = title ? title[0].toUpperCase() + title.slice(1) : '';
  return r;
}

// Человекочитаемые «чипы» для предпросмотра
export function parsedChips(p, today = todayStr()) {
  const chips = [];
  if (p.date !== undefined && p.date !== null) {
    const n = diffDays(today, p.date);
    chips.push({ k: 'date', label: n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n === 2 ? 'послезавтра' : fmtDate(p.date, { weekday: true }) });
  }
  if (p.time) chips.push({ k: 'time', label: p.time });
  else if (p.slot && p.slot !== 'anytime') chips.push({ k: 'slot', label: { morning: 'утром', afternoon: 'днём', evening: 'вечером' }[p.slot] });
  if (p.duration_min) chips.push({ k: 'dur', label: fmtDur(p.duration_min) });
  if (p.area) chips.push({ k: 'area', label: `#${p.area}` });
  if (p.frog) chips.push({ k: 'frog', label: 'главное' });
  else if (p.priority === 1) chips.push({ k: 'prio', label: 'важно' });
  else if (p.priority === 3) chips.push({ k: 'prio', label: 'не срочно' });
  if (p.deep) chips.push({ k: 'deep', label: 'глубокая работа' });
  if (p.repeat) chips.push({ k: 'repeat', label: repeatLabel(p.repeat) });
  return chips;
}

export function repeatLabel(rep) {
  if (!rep) return 'Не повторять';
  if (rep.type === 'daily') return 'каждый день';
  if (rep.type === 'weekdays') return 'по будням';
  if (rep.type === 'monthly') return 'каждый месяц';
  if (rep.type === 'weekly') {
    const d = rep.days || [];
    if (d.length === 7) return 'каждый день';
    return 'по ' + d.map((x) => WD_SHORT[x - 1]).join(', ');
  }
  return '';
}

// Следующая дата повтора строго после from
export function nextRepeatDate(rep, from) {
  if (!rep) return null;
  if (rep.type === 'daily') return addDays(from, 1);
  if (rep.type === 'weekdays') {
    let d = addDays(from, 1);
    while (weekday(d) > 5) d = addDays(d, 1);
    return d;
  }
  if (rep.type === 'weekly') {
    const days = rep.days && rep.days.length ? rep.days : [weekday(from)];
    let d = addDays(from, 1);
    for (let i = 0; i < 8; i++) {
      if (days.includes(weekday(d))) return d;
      d = addDays(d, 1);
    }
    return null;
  }
  if (rep.type === 'monthly') {
    const f = parseDate(from);
    const day = rep.day || f.getDate();
    let y = f.getFullYear();
    let m = f.getMonth() + 1;
    if (m > 11) { m = 0; y++; }
    const last = new Date(y, m + 1, 0).getDate();
    return `${y}-${pad(m + 1)}-${pad(Math.min(day, last))}`;
  }
  return null;
}
