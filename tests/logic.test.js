// Тесты логики: парсер быстрого ввода, автоплан, повторы, очки, экспорт/импорт.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick, nextRepeatDate, parsedChips } from '../shared/parse.js';
import { autoplan, timeScale, headScale, taskPoints, pointsByDay, streak, weekdayRecords, spawnNext, habitStreak, DEFAULT_SETTINGS } from '../shared/planning.js';
import { buildExport, exportPrompt, normalizeImport } from '../shared/transfer.js';
import { fmtDate, weekday, addDays, fmtDur } from '../shared/dates.js';
import { pageIdFromUrl, taskProps } from '../server/notion.js';

const O = { today: '2026-10-16', nowMin: 10 * 60 }; // пятница

test('парсер: пример из ТЗ', () => {
  const r = parseQuick('созвон 1.5ч в 16:00 завтра #работа !', O);
  assert.deepEqual(
    { title: r.title, date: r.date, time: r.time, dur: r.duration_min, area: r.area, prio: r.priority, slot: r.slot },
    { title: 'Созвон', date: '2026-10-17', time: '16:00', dur: 90, area: 'работа', prio: 1, slot: 'afternoon' },
  );
});

test('парсер: «20.10» — дата, а не время', () => {
  const r = parseQuick('сдать отчёт 20.10', O);
  assert.equal(r.date, '2026-10-20');
  assert.equal(r.time, null);
  assert.equal(r.title, 'Сдать отчёт');
  assert.equal(parseQuick('план 05.01', O).date, '2027-01-05');
  assert.equal(parseQuick('план 20.10.2027', O).date, '2027-10-20');
});

test('парсер: приоритеты, главное, не срочно', () => {
  assert.equal(parseQuick('статья !!', O).frog, true);
  assert.equal(parseQuick('статья!!', O).frog, true);
  assert.equal(parseQuick('молоко ~', O).priority, 3);
  assert.equal(parseQuick('отчёт ! завтра', O).priority, 1);
  assert.equal(parseQuick('обычная задача', O).priority, 2);
});

test('парсер: длительности', () => {
  assert.equal(parseQuick('бег 30м', O).duration_min, 30);
  assert.equal(parseQuick('бег 45 мин', O).duration_min, 45);
  assert.equal(parseQuick('дизайн 2ч', O).duration_min, 120);
  assert.equal(parseQuick('дизайн 1,5 часа', O).duration_min, 90);
  assert.equal(parseQuick('обзор 1ч30м', O).duration_min, 90);
  assert.equal(parseQuick('звонок на полчаса', O).duration_min, 30);
  const r = parseQuick('с 14:00 до 15:30 дизайн', O);
  assert.equal(r.time, '14:00');
  assert.equal(r.duration_min, 90);
});

test('парсер: дни недели, утро/день/вечер, относительные даты', () => {
  assert.equal(parseQuick('встреча в понедельник', O).date, '2026-10-19');
  assert.equal(parseQuick('встреча во вторник', O).date, '2026-10-20');
  assert.equal(parseQuick('встреча пт', O).date, '2026-10-16');
  assert.equal(parseQuick('встреча в следующую пятницу', O).date, '2026-10-23');
  assert.equal(parseQuick('йога утром', O).slot, 'morning');
  assert.equal(parseQuick('прогулка вечером', O).slot, 'evening');
  assert.equal(parseQuick('обед днём', O).slot, 'afternoon');
  assert.equal(parseQuick('ужин в 7 вечера', O).time, '19:00');
  assert.equal(parseQuick('пробежка в 9 утра', O).time, '09:00');
  assert.equal(parseQuick('дело послезавтра', O).date, '2026-10-18');
  assert.equal(parseQuick('дело через 3 дня', O).date, '2026-10-19');
  assert.equal(parseQuick('дело через неделю', O).date, '2026-10-23');
  assert.equal(parseQuick('звонок через 2 часа', O).time, '12:00');
  assert.equal(parseQuick('отпуск 20 октября', O).date, '2026-10-20');
  assert.equal(parseQuick('без даты', O).date, undefined);
});

test('парсер: повторы', () => {
  assert.deepEqual(parseQuick('медитация каждый день', O).repeat, { type: 'daily' });
  assert.deepEqual(parseQuick('отчёт по будням', O).repeat, { type: 'weekdays' });
  const w = parseQuick('спортзал по пн и чт в 19:00', O);
  assert.deepEqual(w.repeat, { type: 'weekly', days: [1, 4] });
  assert.equal(w.date, '2026-10-19');
  assert.equal(w.title, 'Спортзал');
  assert.deepEqual(parseQuick('бюджет каждый месяц', O).repeat, { type: 'monthly' });
});

test('парсер: чипы предпросмотра', () => {
  const chips = parsedChips(parseQuick('созвон 1.5ч в 16:00 завтра #работа !', O), O.today).map((c) => c.label);
  assert.deepEqual(chips, ['завтра', '16:00', '1 ч 30 мин', '#работа', 'важно']);
});

test('повторы: следующая дата', () => {
  assert.equal(nextRepeatDate({ type: 'daily' }, '2026-10-16'), '2026-10-17');
  assert.equal(nextRepeatDate({ type: 'weekdays' }, '2026-10-16'), '2026-10-19');
  assert.equal(nextRepeatDate({ type: 'weekly', days: [2, 4] }, '2026-10-16'), '2026-10-20');
  assert.equal(nextRepeatDate({ type: 'monthly' }, '2026-01-31'), '2026-02-28');
  assert.equal(nextRepeatDate({ type: 'monthly' }, '2026-12-15'), '2027-01-15');
});

test('повторы: при выполнении создаётся следующая, чек-лист сброшен', () => {
  const t = { id: 'a', title: 'Йога', date: '2026-10-16', done: true, repeat: { type: 'daily' }, checklist: [{ id: 'c', text: 'коврик', done: true }] };
  const n = spawnNext(t, 'b', 1, '2026-10-16');
  assert.equal(n.id, 'b');
  assert.equal(n.date, '2026-10-17');
  assert.equal(n.done, false);
  assert.equal(n.checklist[0].done, false);
  assert.equal(spawnNext({ ...t, repeat: { type: 'daily', spawned: 'b' } }, 'c'), null);
  // просроченная повторяющаяся задача: следующая — не в прошлом
  const old = spawnNext({ ...t, date: '2026-10-01' }, 'd', 1, '2026-10-16');
  assert.equal(old.date, '2026-10-16');
});

test('шкалы «Время» и «Голова»', () => {
  const tasks = [{ duration_min: 120, deep: true }, { duration_min: 60, frog: true }, { duration_min: 60, done: true }, {}];
  const t = timeScale(tasks, DEFAULT_SETTINGS);
  assert.equal(t.need, (120 + 60 + 30) * 1.5);
  assert.equal(t.cap, 390);
  assert.equal(t.over, false);
  const h = headScale(tasks, { ...DEFAULT_SETTINGS, headLimitH: 2 });
  assert.equal(h.need, 180);
  assert.equal(h.cap, 120);
  assert.equal(h.over, true);
});

test('автоплан: главное и глубокое — в пик, мелочи — после, обед свободен, фикс. время не трогаем', () => {
  const tasks = [
    { id: 'm1', title: 'Почта', duration_min: 15 },
    { id: 'f', title: 'Главное', frog: true, duration_min: 90 },
    { id: 'd', title: 'Глубокое', deep: true, duration_min: 60 },
    { id: 'fix', title: 'Созвон', time: '15:00', duration_min: 60 },
    { id: 'm2', title: 'Звонок', duration_min: 30 },
    { id: 'done', title: 'Сделано', done: true },
  ];
  const { proposals, unplaced } = autoplan(tasks, DEFAULT_SETTINGS, { date: '2026-10-16', today: '2026-10-15' });
  const at = Object.fromEntries(proposals.map((p) => [p.id, p.time]));
  assert.equal(at.f, '10:00');
  // перерыв 15 минут после 90-минутного блока
  assert.equal(at.d, '11:45');
  assert.ok(!('fix' in at) && !('done' in at));
  for (const id of ['m1', 'm2']) {
    assert.ok(at[id] >= '13:00', `${id} после пика: ${at[id]}`);
    assert.ok(!(at[id] >= '13:00' && at[id] < '14:00'), `обед свободен: ${at[id]}`);
    assert.ok(!(at[id] >= '15:00' && at[id] < '16:00'), `не на созвоне: ${at[id]}`);
  }
  assert.deepEqual(unplaced, []);
});

test('автоплан: сегодня — не раньше текущего времени; не влезло — в unplaced', () => {
  const r = autoplan([{ id: 'a', title: 'A', duration_min: 30 }], DEFAULT_SETTINGS, { date: '2026-10-16', today: '2026-10-16', nowM: 14 * 60 + 2 });
  assert.equal(r.proposals[0].time, '14:05');
  const big = autoplan([{ id: 'b', title: 'B', duration_min: 600 }], DEFAULT_SETTINGS, { date: '2026-10-16', today: '2026-10-15' });
  assert.deepEqual(big.unplaced, ['b']);
});

test('очки, серия, рекорды по дням недели', () => {
  assert.equal(taskPoints({ done: true, duration_min: 20 }), 10);
  assert.equal(taskPoints({ done: true }), 10);
  assert.equal(taskPoints({ done: true, duration_min: 31 }), 25);
  assert.equal(taskPoints({ done: true, duration_min: 90 }), 25);
  assert.equal(taskPoints({ done: true, duration_min: 91 }), 30);
  assert.equal(taskPoints({ done: true, duration_min: 10, frog: true }), 40);
  assert.equal(taskPoints({ done: false, duration_min: 10 }), 0);
  const tasks = [
    { date: '2026-10-14', done: true, duration_min: 120 },
    { date: '2026-10-15', done: true, frog: true },
    { date: '2026-10-16', done: false },
    { date: '2026-10-12', done: true },
  ];
  assert.deepEqual(pointsByDay(tasks), { '2026-10-14': 30, '2026-10-15': 40, '2026-10-12': 10 });
  assert.equal(streak(tasks, '2026-10-16'), 2);
  const rec = weekdayRecords(tasks);
  assert.equal(rec[3].points, 40); // четверг
  assert.equal(rec[0].points, 10); // понедельник
});

test('серия привычки учитывает дни недели', () => {
  const h = { days: [1, 3, 5] };
  const logs = new Set(['2026-10-16', '2026-10-14', '2026-10-12', '2026-10-09']);
  assert.equal(habitStreak(h, logs, '2026-10-16'), 4);
});

test('экспорт месяца и импорт обратно (дубли пропускаются)', () => {
  const tasks = [
    { id: '1', title: 'Отчёт', date: '2026-10-05', done: true, duration_min: 60, area: 'работа' },
    { id: '2', title: 'Спорт', date: '2026-10-06', done: false },
    { id: '3', title: 'Сентябрь', date: '2026-09-30', done: true },
    { id: '4', title: 'Удалено', date: '2026-10-07', deleted: true },
  ];
  const items = [
    { id: 'h1', kind: 'habit', data: { name: 'Зарядка', days: [1, 2, 3, 4, 5] } },
    { id: 'hl:h1:2026-10-05', kind: 'habit_log', data: { habit: 'h1', date: '2026-10-05' } },
    { id: 'day:2026-10-05', kind: 'day', data: { date: '2026-10-05', mood: 4, energy: 3, good: 'Сдал отчёт' } },
    { id: 'a1', kind: 'area', data: { name: 'работа', goal: 10 } },
  ];
  const data = buildExport({ tasks, items }, '2026-10', '2026-10-16');
  assert.equal(data.format, 'planner-export');
  assert.equal(data.tasks.length, 2);
  assert.equal(data.stats.points, 25);
  assert.equal(data.stats.hours_by_area['работа'], 1);
  assert.deepEqual(data.habits[0].done_dates, ['2026-10-05']);
  assert.equal(data.days[0].mood, 4);
  const prompt = exportPrompt(data);
  assert.match(prompt, /октябрь 2026/);
  assert.match(prompt, /```json/);

  const existing = { taskKeys: new Set(['отчёт|2026-10-05']), habitNames: new Set(['зарядка']), areaNames: new Set(), noteTitles: new Set() };
  const imp = normalizeImport(JSON.parse(JSON.stringify(data)), existing);
  assert.equal(imp.tasks.length, 1);
  assert.equal(imp.tasks[0].title, 'Спорт');
  assert.equal(imp.habits.length, 0);
  assert.equal(imp.areas.length, 1);
  assert.equal(imp.skipped, 2);

  const simple = normalizeImport({ tasks: ['Купить хлеб', { title: 'Позвонить', date: '2026-10-20', time: '10:00' }, 'Купить хлеб'], habits: ['Чтение'] }, { taskKeys: new Set(), habitNames: new Set(), areaNames: new Set(), noteTitles: new Set() });
  assert.equal(simple.tasks.length, 2);
  assert.equal(simple.skipped, 1);
  assert.equal(simple.habits[0].name, 'Чтение');
});

test('даты по-русски, 24 часа', () => {
  assert.equal(fmtDate('2026-10-16', { weekday: true }), '16 октября, пт');
  assert.equal(weekday('2026-10-18'), 7);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(fmtDur(90), '1 ч 30 мин');
});

test('Notion: ID страницы из ссылки и свойства задачи', () => {
  assert.equal(pageIdFromUrl('https://www.notion.so/My-page-1234abcd1234123412341234567890ab?pvs=4'), '1234abcd-1234-1234-1234-1234567890ab');
  assert.equal(pageIdFromUrl('https://notion.so/ws/1234abcd-1234-1234-1234-1234567890ab'), '1234abcd-1234-1234-1234-1234567890ab');
  assert.equal(pageIdFromUrl('мусор'), null);
  const p = taskProps({ title: 'Поздно', date: '2026-10-16', time: '23:30', duration_min: 60, done: false, frog: true });
  assert.equal(p['Когда'].date.end, '2026-10-17T00:30:00');
  assert.equal(p['Главное'].checkbox, true);
});
