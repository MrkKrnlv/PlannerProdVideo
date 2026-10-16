// Workers AI: распознавание речи (Whisper) и разбор задач (Llama 3.3, JSON-режим).
import { addDays, zonedParts, weekday, WD_FULL } from '../shared/dates.js';
import { parseQuick } from '../shared/parse.js';

export const WHISPER = '@cf/openai/whisper-large-v3-turbo';
export const LLAMA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export async function transcribe(env, audioBuf) {
  const res = await env.AI.run(WHISPER, { audio: toBase64(audioBuf), language: 'ru', vad_filter: true });
  return String(res?.text || '').trim();
}

const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          duration_min: { type: ['integer', 'null'] },
          area: { type: ['string', 'null'] },
          priority: { type: 'integer' },
          frog: { type: 'boolean' },
          deep: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['title', 'date', 'time', 'duration_min', 'priority'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['tasks', 'summary'],
};

function buildPrompt({ today, nowTime, upcoming, areas }) {
  const days = Array.from({ length: 8 }, (_, i) => {
    const d = addDays(today, i);
    return `${d} — ${WD_FULL[weekday(d) - 1]}${i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : ''}`;
  }).join('\n');
  const ctx = upcoming.length
    ? upcoming.map((t) => `- ${t.date}${t.time ? ' ' + t.time : ''}: ${t.title}${t.duration_min ? ` (${t.duration_min} мин)` : ''}`).join('\n')
    : '(задач нет)';
  return `Ты помощник личного планера. Разбери сообщение пользователя на отдельные задачи.
Часовой пояс Europe/Moscow. Сейчас ${nowTime}, сегодня ${today} (${WD_FULL[weekday(today) - 1]}).
Календарь на неделю вперёд:
${days}

Уже запланировано на 7 дней (не дублируй эти задачи, учитывай занятое время):
${ctx}

Сферы пользователя: ${areas.length ? areas.join(', ') : 'нет'}.

Правила:
- title: коротко, с заглавной буквы, без даты и времени в тексте.
- date: YYYY-MM-DD. «сегодня», «завтра», дни недели переводи в дату по календарю. Если дата не названа — null.
- time: HH:MM в 24-часовом формате или null. «в 7 вечера» = 19:00. Запись вида «20.10» — это дата 20 октября, а не время.
- duration_min: длительность в минутах, если названа («полтора часа» = 90), иначе null.
- area: одна из сфер пользователя, если подходит по смыслу, иначе null.
- priority: 1 — важно/срочно, 2 — обычно, 3 — не срочно.
- frog: true только если сказано, что это главное дело дня.
- deep: true для задач, требующих глубокой сосредоточенной работы.
- note: детали, которые не вошли в название, иначе пустая строка.
- summary: одна короткая фраза по-русски о том, что добавлено.
Отвечай только JSON по схеме {"tasks": [...], "summary": "..."}.`;
}

export function extractJson(text) {
  if (!text) return null;
  if (typeof text === 'object') return text;
  const s = String(text);
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

function validShape(o) {
  return o && Array.isArray(o.tasks) && o.tasks.every((t) => t && typeof t.title === 'string');
}

export function sanitizeTasks(list, today) {
  const out = [];
  for (const t of list || []) {
    const title = String(t.title || '').trim().slice(0, 300);
    if (!title) continue;
    let date = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null;
    if (date && date < addDays(today, -1)) date = today;
    let time = typeof t.time === 'string' ? t.time.trim() : null;
    if (time && /^\d{1,2}:\d{2}$/.test(time)) {
      const [h, m] = time.split(':').map(Number);
      time = h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
    } else time = null;
    const dur = Number(t.duration_min);
    const prio = Number(t.priority);
    out.push({
      title: title[0].toUpperCase() + title.slice(1),
      date: date || (time ? today : null),
      time,
      duration_min: dur > 0 && dur <= 720 ? Math.round(dur) : null,
      area: t.area ? String(t.area).toLowerCase().slice(0, 40) : null,
      priority: [1, 2, 3].includes(prio) ? prio : 2,
      frog: !!t.frog,
      deep: !!t.deep,
      note: t.note ? String(t.note).slice(0, 1000) : '',
    });
  }
  return out.slice(0, 20);
}

// Запасной вариант без ИИ: каждая строка/фраза через «;» — задача
export function fallbackParse(text, today, nowMinutes) {
  const parts = String(text).split(/\n|;|(?:\s+и\s+ещё\s+)/i).map((x) => x.trim()).filter(Boolean);
  return parts.map((p) => {
    const r = parseQuick(p, { today, nowMin: nowMinutes });
    return { title: r.title || p, date: r.date ?? null, time: r.time, duration_min: r.duration_min, area: r.area, priority: r.priority, frog: r.frog, deep: r.deep, note: '' };
  });
}

export async function parseTasks(env, text, { upcoming = [], areas = [], tz = 'Europe/Moscow' } = {}) {
  const z = zonedParts(tz);
  const system = buildPrompt({ today: z.date, nowTime: z.time, upcoming, areas });
  const messages = [{ role: 'system', content: system }, { role: 'user', content: text }];
  let parsed = null;
  let via = 'llm';
  try {
    const res = await env.AI.run(LLAMA, {
      messages,
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 1500,
      temperature: 0.1,
    });
    const o = extractJson(res?.response);
    if (validShape(o)) parsed = o;
  } catch (e) {
    console.log('json mode failed', e && e.message);
  }
  if (!parsed) {
    try {
      const res = await env.AI.run(LLAMA, { messages, max_tokens: 1500, temperature: 0.1 });
      const o = extractJson(res?.response);
      if (validShape(o)) parsed = o;
    } catch (e) {
      console.log('plain mode failed', e && e.message);
    }
  }
  if (!parsed) {
    via = 'fallback';
    parsed = { tasks: fallbackParse(text, z.date, z.min), summary: '' };
  }
  return { tasks: sanitizeTasks(parsed.tasks, z.date), summary: String(parsed.summary || '').slice(0, 300), via, today: z.date };
}
