// Экспорт месяца для Claude и импорт JSON.
import { monthDays, todayStr, MONTHS } from './dates.js';
import { pointsByDay, streak, taskDur, taskPoints } from './planning.js';

const pickTask = (t) => ({
  title: t.title, date: t.date || null, time: t.time || null, slot: t.slot || 'anytime',
  duration_min: t.duration_min || null, area: t.area || null, priority: t.priority || 2,
  note: t.note || '', deep: !!t.deep, frog: !!t.frog, repeat: t.repeat || null,
  checklist: t.checklist || [], done: !!t.done, source: t.source || 'app',
});

export function buildExport({ tasks, items }, ym, today = todayStr()) {
  const days = monthDays(ym);
  const inMonth = (d) => d && d.startsWith(ym);
  const liveTasks = tasks.filter((t) => !t.deleted);
  const monthTasks = liveTasks.filter((t) => inMonth(t.date));
  const live = items.filter((i) => !i.deleted);
  const habits = live.filter((i) => i.kind === 'habit');
  const logs = live.filter((i) => i.kind === 'habit_log' && inMonth(i.data.date) && i.data.done !== false);
  const dayItems = live.filter((i) => i.kind === 'day' && inMonth(i.data.date));
  const notes = live.filter((i) => i.kind === 'note' && inMonth(new Date(i.data.created || i.updated_at).toISOString().slice(0, 10)));
  const areas = live.filter((i) => i.kind === 'area');
  const pts = pointsByDay(monthTasks);
  const byArea = {};
  for (const t of monthTasks) if (t.done) byArea[t.area || 'без сферы'] = (byArea[t.area || 'без сферы'] || 0) + taskDur(t);

  const data = {
    format: 'planner-export',
    version: 1,
    month: ym,
    exported_at: new Date().toISOString(),
    stats: {
      tasks_total: monthTasks.length,
      tasks_done: monthTasks.filter((t) => t.done).length,
      points: monthTasks.reduce((a, t) => a + taskPoints(t), 0),
      streak_now: streak(liveTasks, today),
      hours_by_area: Object.fromEntries(Object.entries(byArea).map(([k, v]) => [k, Math.round(v / 6) / 10])),
      points_by_day: Object.fromEntries(days.map((d) => [d, pts[d] || 0])),
    },
    areas: areas.map((a) => ({ name: a.data.name, weekly_goal_h: a.data.goal || 0 })),
    habits: habits.map((h) => ({
      name: h.data.name, days: h.data.days || [1, 2, 3, 4, 5, 6, 7], remind: h.data.remind || null,
      done_dates: logs.filter((l) => l.data.habit === h.id).map((l) => l.data.date).sort(),
    })),
    days: dayItems.map((d) => ({
      date: d.data.date, mood: d.data.mood ?? null, energy: d.data.energy ?? null,
      good: d.data.good || '', note: d.data.note || '', light: !!d.data.light, closed: !!d.data.closed,
    })).sort((a, b) => a.date.localeCompare(b.date)),
    notes: notes.map((n) => ({ title: n.data.title || '', text: n.data.text || '' })),
    tasks: monthTasks.map(pickTask).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '99').localeCompare(b.time || '99')),
  };
  return data;
}

export function exportPrompt(data) {
  const [y, m] = data.month.split('-');
  return `Ты — мой коуч по продуктивности. Ниже JSON с моими задачами, привычками и итогами дней за ${MONTHS[Number(m) - 1].toLowerCase()} ${y}.

Разбери месяц по пунктам:
1. Что получилось: главные результаты, лучшие дни и почему они удались.
2. Где проседаю: хвосты, перенесённые задачи, перегруженные дни, сферы без внимания.
3. Привычки: какие держатся, какие срываются и в какие дни недели.
4. Энергия и настроение: связь с нагрузкой, глубокой работой и днями недели.
5. Три конкретных изменения на следующий месяц (что убрать, что добавить, как планировать неделю).

Пиши кратко, по делу, опирайся на цифры из данных.

\`\`\`json
${JSON.stringify(data, null, 1)}
\`\`\``;
}

// Нормализация импорта. Принимает формат экспорта или простой {tasks:[…], habits:[…]}.
// existing: { taskKeys: Set('название|дата'), habitNames: Set, areaNames: Set, noteTitles: Set }
export function normalizeImport(json, existing) {
  if (typeof json === 'string') json = JSON.parse(json);
  if (Array.isArray(json)) json = { tasks: json };
  if (!json || typeof json !== 'object') throw new Error('Неверный формат файла');
  const out = { tasks: [], habits: [], areas: [], notes: [], days: [], habitLogs: [], skipped: 0 };
  const lc = (s) => String(s || '').trim().toLowerCase();
  const seenT = new Set(existing.taskKeys);
  for (const raw of json.tasks || []) {
    const t = typeof raw === 'string' ? { title: raw } : raw;
    const title = String(t.title || t.name || '').trim();
    if (!title) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null;
    const key = `${lc(title)}|${date || ''}`;
    if (seenT.has(key)) { out.skipped++; continue; }
    seenT.add(key);
    out.tasks.push({
      title, date,
      time: /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : null,
      slot: ['morning', 'afternoon', 'evening', 'anytime'].includes(t.slot) ? t.slot : 'anytime',
      duration_min: Number(t.duration_min || t.duration) || null,
      area: t.area ? lc(t.area) : null,
      priority: [1, 2, 3].includes(Number(t.priority)) ? Number(t.priority) : 2,
      note: String(t.note || ''),
      deep: !!t.deep, frog: !!t.frog,
      repeat: t.repeat && typeof t.repeat === 'object' ? t.repeat : null,
      checklist: Array.isArray(t.checklist) ? t.checklist.map((c, i) => ({ id: c.id || `c${i}`, text: String(c.text || c), done: !!c.done })) : [],
      done: !!t.done,
    });
  }
  const seenH = new Set(existing.habitNames);
  for (const raw of json.habits || []) {
    const h = typeof raw === 'string' ? { name: raw } : raw;
    const name = String(h.name || h.title || '').trim();
    if (!name) continue;
    if (seenH.has(lc(name))) { out.skipped++; continue; }
    seenH.add(lc(name));
    out.habits.push({ name, days: Array.isArray(h.days) && h.days.length ? h.days : [1, 2, 3, 4, 5, 6, 7], remind: h.remind || null, done_dates: h.done_dates || [] });
  }
  const seenA = new Set(existing.areaNames);
  for (const a of json.areas || []) {
    const name = lc(typeof a === 'string' ? a : a.name);
    if (!name || seenA.has(name)) { if (name) out.skipped++; continue; }
    seenA.add(name);
    out.areas.push({ name, goal: Number(a.weekly_goal_h || a.goal) || 0 });
  }
  const seenN = new Set(existing.noteTitles);
  for (const n of json.notes || []) {
    const title = String(n.title || '').trim();
    const text = String(n.text || '');
    const key = lc(title || text.slice(0, 40));
    if (!key || seenN.has(key)) { if (key) out.skipped++; continue; }
    seenN.add(key);
    out.notes.push({ title, text });
  }
  for (const d of json.days || []) if (d && d.date) out.days.push(d);
  return out;
}
