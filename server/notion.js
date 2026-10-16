// Notion: односторонний синк задач с датой в базу «Планер».
import { taskOut } from './db.js';
import { toMin, fromMin, addDays } from '../shared/dates.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
export const NOTION_BUDGET = 35;

async function notion(token, method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* */ }
  return { status: r.status, ok: r.ok, data };
}

export function pageIdFromUrl(url) {
  const raw = String(url || '').trim();
  let cand = null;
  const p = raw.match(/[?&]p=([0-9a-f]{32})/i);
  if (p) cand = p[1];
  if (!cand) {
    const seg = raw.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    const uuid = seg.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    const plain = seg.match(/(?:^|[^0-9a-f])([0-9a-f]{32})$/i);
    cand = uuid ? uuid[1].replace(/-/g, '') : plain ? plain[1] : null;
  }
  if (!cand) return null;
  const h = cand.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function connectNotion(db, userId, token, pageUrl) {
  token = String(token || '').trim();
  const pageId = pageIdFromUrl(pageUrl);
  if (!token) throw new Error('Вставь секрет интеграции Notion');
  if (!pageId) throw new Error('Не удалось найти ID страницы в ссылке');
  const page = await notion(token, 'GET', `/pages/${pageId}`);
  if (page.status === 401) throw new Error('Notion не принял секрет интеграции');
  if (!page.ok) throw new Error('Нет доступа к странице. Открой её в Notion → ••• → Connections и добавь свою интеграцию');
  const created = await notion(token, 'POST', '/databases', {
    parent: { type: 'page_id', page_id: pageId },
    title: [{ type: 'text', text: { content: 'Планер' } }],
    properties: {
      'Задача': { title: {} },
      'Когда': { date: {} },
      'Готово': { checkbox: {} },
      'Сфера': { select: { options: [] } },
      'Минут': { number: { format: 'number' } },
      'Главное': { checkbox: {} },
    },
  });
  if (!created.ok) throw new Error('Не удалось создать базу: ' + (created.data?.message || created.status));
  await db.prepare('UPDATE users SET notion_token = ?, notion_db = ?, notion_cursor = 0, notion_error = NULL, updated_at = ? WHERE user_id = ?')
    .bind(token, created.data.id, Date.now(), userId).run();
  await db.prepare('DELETE FROM notion_map WHERE user_id = ?').bind(userId).run();
  return { db: created.data.id, url: created.data.url || null };
}

export async function disconnectNotion(db, userId) {
  await db.prepare('UPDATE users SET notion_token = NULL, notion_db = NULL, notion_cursor = 0, notion_error = NULL WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM notion_map WHERE user_id = ?').bind(userId).run();
}

export function taskProps(t, tz = 'Europe/Moscow') {
  let date;
  if (t.time) {
    const st = toMin(t.time);
    const en = st + (t.duration_min || 0);
    date = { start: `${t.date}T${t.time}:00`, time_zone: tz };
    if (t.duration_min) {
      const endDate = en >= 1440 ? addDays(t.date, 1) : t.date;
      date.end = `${endDate}T${fromMin(en % 1440)}:00`;
    }
  } else date = { start: t.date };
  return {
    'Задача': { title: [{ type: 'text', text: { content: t.title.slice(0, 1900) || 'Без названия' } }] },
    'Когда': { date },
    'Готово': { checkbox: !!t.done },
    'Сфера': { select: t.area ? { name: t.area.replace(/,/g, ' ').slice(0, 90) } : null },
    'Минут': { number: t.duration_min || null },
    'Главное': { checkbox: !!t.frog },
  };
}

// Один запуск cron: не больше budget запросов к Notion на всех пользователей
export async function notionSync(db, { budget = NOTION_BUDGET, onlyUser = null } = {}) {
  let left = budget;
  const stats = { requests: 0, created: 0, updated: 0, archived: 0, errors: 0 };
  const q = onlyUser
    ? db.prepare('SELECT * FROM users WHERE notion_db IS NOT NULL AND user_id = ?').bind(onlyUser)
    : db.prepare('SELECT * FROM users WHERE notion_db IS NOT NULL ORDER BY updated_at');
  const users = (await q.all()).results || [];
  for (const u of users) {
    if (left <= 0) break;
    let cursor = u.notion_cursor || 0;
    const rows = ((await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?').bind(u.user_id, cursor, left + 50).all()).results || []).map(taskOut);
    let stop = false;
    let error = null;
    for (const t of rows) {
      const map = await db.prepare('SELECT page_id FROM notion_map WHERE user_id = ? AND task_id = ?').bind(u.user_id, t.id).first();
      const gone = t.deleted || !t.date;
      if (gone && !map) { cursor = t.rev; continue; }
      if (left <= 0) break;
      left--; stats.requests++;
      let res;
      if (gone) {
        res = await notion(u.notion_token, 'PATCH', `/pages/${map.page_id}`, { archived: true });
        if (res.ok || res.status === 404) {
          await db.prepare('DELETE FROM notion_map WHERE user_id = ? AND task_id = ?').bind(u.user_id, t.id).run();
          stats.archived++;
          res.ok = true;
        }
      } else if (map) {
        res = await notion(u.notion_token, 'PATCH', `/pages/${map.page_id}`, { properties: taskProps(t, u.tz || 'Europe/Moscow'), archived: false });
        if (res.status === 404) {
          // страницу удалили руками — создадим заново при следующем проходе
          await db.prepare('DELETE FROM notion_map WHERE user_id = ? AND task_id = ?').bind(u.user_id, t.id).run();
          stop = true;
        } else if (res.ok) stats.updated++;
      } else {
        res = await notion(u.notion_token, 'POST', '/pages', { parent: { database_id: u.notion_db }, properties: taskProps(t, u.tz || 'Europe/Moscow') });
        if (res.ok) {
          await db.prepare('INSERT OR REPLACE INTO notion_map (user_id, task_id, page_id) VALUES (?, ?, ?)').bind(u.user_id, t.id, res.data.id).run();
          stats.created++;
        }
      }
      if (stop) break;
      if (!res.ok) {
        stats.errors++;
        error = `${res.status}: ${res.data?.message || 'ошибка Notion'}`;
        if (res.status === 429) left = 0;
        // 400 — проблема конкретной задачи: пропускаем её, чтобы синк не застрял
        if (res.status === 400) { cursor = t.rev; continue; }
        break;
      }
      cursor = t.rev;
    }
    await db.prepare('UPDATE users SET notion_cursor = ?, notion_error = ? WHERE user_id = ?').bind(cursor, error, u.user_id).run();
  }
  return stats;
}
