// Единый Cloudflare Worker: API, Telegram-бот, cron, статика из dist/.
import { ensureSchema, upsertTasks, upsertItems, taskOut, itemOut, currentRev, getConfig, setConfig } from './db.js';
import { authenticate, verifyInitData, ensureUser, isAllowed, randomKey, webhookSecret } from './auth.js';
import { handleWebhook, setupBot, habitReminders, addTasksFromText } from './telegram.js';
import { connectNotion, disconnectNotion, notionSync } from './notion.js';
import { parseQuick } from '../shared/parse.js';
import { zonedParts } from '../shared/dates.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const err = (message, status = 400) => json({ ok: false, error: message }, status);

async function body(request) {
  try { return await request.json(); } catch { return null; }
}

const PAGE = 1000;

async function pull(db, table, userId, since) {
  const r = await db.prepare(`SELECT * FROM ${table} WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?`).bind(userId, since, PAGE + 1).all();
  const rows = r.results || [];
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const rev = page.length ? page[page.length - 1].rev : since;
  return { rows: page.map(table === 'tasks' ? taskOut : itemOut), rev, more };
}

function meOut(u, env) {
  return {
    ok: true,
    user: { id: u.user_id, name: u.name || null, tz: u.tz || 'Europe/Moscow' },
    key: u.key,
    bot: { configured: !!env.BOT_TOKEN, ai: !!env.AI },
    notion: { connected: !!u.notion_db, db: u.notion_db || null, error: u.notion_error || null, cursor: u.notion_cursor || 0 },
  };
}

async function rememberOrigin(env, origin) {
  if (env.PUBLIC_URL) return;
  try {
    if ((await getConfig(env.DB, 'origin')) !== origin) await setConfig(env.DB, 'origin', origin);
  } catch { /* не критично */ }
}

// Вебхук ставится сам при первом обращении к API (и после смены адреса или токена)
let botReadyFor = null;
export function resetBotFlag() { botReadyFor = null; }
async function autoSetupBot(env, origin) {
  const mark = `${origin}|${(await webhookSecret(env.BOT_TOKEN)).slice(0, 12)}`;
  if (botReadyFor === mark) return;
  if ((await getConfig(env.DB, 'bot_setup')) === mark) { botReadyFor = mark; return; }
  const r = await setupBot(env, origin);
  if (r.ok) {
    await setConfig(env.DB, 'bot_setup', mark);
    await rememberOrigin(env, origin);
    botReadyFor = mark;
  } else console.log('auto setup failed', r.errors.join('; '));
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const origin = env.PUBLIC_URL || url.origin;

  await ensureSchema(env.DB);
  if (env.BOT_TOKEN && path !== '/api/telegram/webhook') ctx.waitUntil(autoSetupBot(env, origin).catch((e) => console.log('auto setup', e && e.message)));

  if (path === '/api/health') return json({ ok: true, time: Date.now(), ai: !!env.AI, bot: !!env.BOT_TOKEN });

  if (path === '/api/telegram/webhook' && method === 'POST') {
    await rememberOrigin(env, url.origin);
    return handleWebhook(request, env, ctx);
  }

  if (path === '/api/auth/telegram' && method === 'POST') {
    const b = await body(request);
    const tgUser = await verifyInitData(b?.initData, env.BOT_TOKEN);
    if (!tgUser) return err('Не удалось проверить данные Telegram', 401);
    if (!isAllowed(env, tgUser.id)) return err('Доступ закрыт', 403);
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
    const u = await ensureUser(env.DB, tgUser.id, { name });
    await rememberOrigin(env, url.origin);
    return json(meOut(u, env));
  }

  if (path === '/api/auth/dev' && method === 'POST') {
    if (env.DEV_MODE !== '1') return err('Недоступно', 404);
    const u = await ensureUser(env.DB, '1000', { name: 'Демо' });
    return json(meOut(u, env));
  }

  const user = await authenticate(request, env);
  if (!user) return err('Нужна авторизация', 401);
  const uid = user.user_id;

  if (path === '/api/me' && method === 'GET') return json(meOut(user, env));
  if (path === '/api/me' && method === 'POST') {
    const b = (await body(request)) || {};
    if (b.tz && /^[A-Za-z_]+\/[A-Za-z_\-+0-9/]+$/.test(b.tz)) {
      try { zonedParts(b.tz); await env.DB.prepare('UPDATE users SET tz = ? WHERE user_id = ?').bind(b.tz, uid).run(); } catch { /* неизвестный пояс */ }
    }
    return json(meOut({ ...user, tz: b.tz || user.tz }, env));
  }
  if (path === '/api/me/rotate-key' && method === 'POST') {
    const key = randomKey();
    await env.DB.prepare('UPDATE users SET key = ? WHERE user_id = ?').bind(key, uid).run();
    return json(meOut({ ...user, key }, env));
  }

  // ——— Синк ———
  if (path === '/api/tasks/sync' || path === '/api/items/sync') {
    const table = path.includes('tasks') ? 'tasks' : 'items';
    if (method === 'GET') {
      const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
      const r = await pull(env.DB, table, uid, since);
      return json({ ok: true, [table]: r.rows, rev: r.rev, more: r.more });
    }
    if (method === 'POST') {
      const b = await body(request);
      const list = b && Array.isArray(b[table]) ? b[table] : null;
      if (!list) return err('Ожидается массив ' + table);
      if (list.length > 500) return err('Слишком много записей за раз (максимум 500)');
      const res = table === 'tasks' ? await upsertTasks(env.DB, uid, list) : await upsertItems(env.DB, uid, list);
      return json({ ok: true, ...res, rev: await currentRev(env.DB) });
    }
  }

  // ——— API для автоматизаций (n8n, Make) ———
  if (path === '/api/tasks' && method === 'GET') {
    const date = url.searchParams.get('date');
    const q = date
      ? env.DB.prepare('SELECT * FROM tasks WHERE user_id = ? AND deleted = 0 AND date = ? ORDER BY time IS NULL, time').bind(uid, date)
      : env.DB.prepare('SELECT * FROM tasks WHERE user_id = ? AND deleted = 0 AND done = 0 ORDER BY date IS NULL, date, time LIMIT 500').bind(uid);
    return json({ ok: true, tasks: ((await q.all()).results || []).map(taskOut) });
  }
  if (path === '/api/tasks' && method === 'POST') {
    const b = (await body(request)) || {};
    const list = Array.isArray(b.tasks) ? b.tasks : [b];
    const z = zonedParts(user.tz || 'Europe/Moscow');
    const now = Date.now();
    if (b.ai && b.text) {
      const res = await addTasksFromText(env, uid, String(b.text), 'api', user.tz || 'Europe/Moscow');
      return json({ ok: true, tasks: res.tasks, summary: res.summary });
    }
    const rows = [];
    for (const [i, t] of list.entries()) {
      let base = t;
      if (t.text && !t.title) {
        const p = parseQuick(String(t.text), { today: z.date, nowMin: z.min });
        base = { ...p, date: p.date === undefined ? null : p.date, ...Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'text')) };
      }
      if (!base.title) continue;
      rows.push({ ...base, id: base.id || `api${now.toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, source: 'api', created_at: now, updated_at: now + i });
    }
    if (!rows.length) return err('Нет задач: передай title или text');
    await upsertTasks(env.DB, uid, rows);
    const ids = rows.map((r) => r.id);
    const saved = await env.DB.prepare(`SELECT * FROM tasks WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(uid, ...ids).all();
    return json({ ok: true, tasks: (saved.results || []).map(taskOut) });
  }

  // ——— Telegram и Notion из настроек ———
  if (path === '/api/telegram/setup' && method === 'POST') {
    try {
      await rememberOrigin(env, url.origin);
      const r = await setupBot(env, origin);
      if (r.ok) await setConfig(env.DB, 'bot_setup', `${origin}|${(await webhookSecret(env.BOT_TOKEN)).slice(0, 12)}`);
      return json(r);
    } catch (e) {
      return err(e.message, 400);
    }
  }
  if (path === '/api/notion/connect' && method === 'POST') {
    const b = (await body(request)) || {};
    try {
      const r = await connectNotion(env.DB, uid, b.token, b.page);
      return json({ ok: true, ...r });
    } catch (e) {
      return err(e.message, 400);
    }
  }
  if (path === '/api/notion/disconnect' && method === 'POST') {
    await disconnectNotion(env.DB, uid);
    return json({ ok: true });
  }
  if (path === '/api/notion/sync' && method === 'POST') {
    const stats = await notionSync(env.DB, { budget: 20, onlyUser: uid });
    return json({ ok: true, ...stats });
  }

  return err('Не найдено', 404);
}

export async function runCron(env, now = new Date()) {
  await ensureSchema(env.DB);
  const origin = env.PUBLIC_URL || (await getConfig(env.DB, 'origin'));
  const [notion, reminders] = await Promise.allSettled([
    notionSync(env.DB),
    origin ? habitReminders(env, origin, now) : Promise.resolve(0),
  ]);
  return {
    notion: notion.status === 'fulfilled' ? notion.value : String(notion.reason),
    reminders: reminders.status === 'fulfilled' ? reminders.value : String(reminders.reason),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': 'content-type, authorization, x-service-key, x-telegram-user-id, x-planner-key',
          },
        });
      }
      try {
        const res = await api(request, env, ctx);
        res.headers.set('access-control-allow-origin', '*');
        return res;
      } catch (e) {
        console.log('api error', e && e.stack);
        return err('Ошибка сервера: ' + (e && e.message), 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, new Date(event.scheduledTime || Date.now())).then((r) => console.log('cron', JSON.stringify(r))));
  },
};
