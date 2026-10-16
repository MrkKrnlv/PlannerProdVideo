// Telegram-бот: вебхук, голос → Whisper → Llama → задачи, напоминания о привычках.
import { webhookSecret, ensureUser, isAllowed } from './auth.js';
import { parseTasks, transcribe } from './ai.js';
import { upsertTasks, upsertItems, taskOut } from './db.js';
import { addDays, zonedParts, fmtDate, fmtDur, toMin, diffDays } from '../shared/dates.js';
import { habitDue, habitLogId } from '../shared/planning.js';

export async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await r.json(); } catch { /* пусто */ }
  if (!data || !data.ok) console.log('tg error', method, data && data.description);
  return data;
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const openBtn = (origin) => ({ inline_keyboard: [[{ text: 'Открыть планер', web_app: { url: origin + '/' } }]] });

function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return 't' + [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

function describeTask(t, today) {
  const parts = [];
  if (t.date) {
    const n = diffDays(today, t.date);
    parts.push(n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n === 2 ? 'послезавтра' : fmtDate(t.date, { weekday: true }));
  } else parts.push('во входящие');
  if (t.time) parts.push(t.time);
  if (t.duration_min) parts.push(fmtDur(t.duration_min));
  if (t.area) parts.push('#' + t.area);
  if (t.frog) parts.push('главное');
  else if (t.priority === 1) parts.push('важно');
  return `• <b>${esc(t.title)}</b> — ${esc(parts.join(', '))}`;
}

async function loadContext(db, userId, today) {
  const up = await db.prepare(
    `SELECT title, date, time, duration_min FROM tasks WHERE user_id = ? AND deleted = 0 AND done = 0 AND date >= ? AND date <= ? ORDER BY date, time LIMIT 60`,
  ).bind(userId, today, addDays(today, 7)).all();
  const ar = await db.prepare(`SELECT data FROM items WHERE user_id = ? AND kind = 'area' AND deleted = 0`).bind(userId).all();
  const areas = (ar.results || []).map((r) => { try { return JSON.parse(r.data).name; } catch { return null; } }).filter(Boolean);
  return { upcoming: up.results || [], areas };
}

export async function addTasksFromText(env, userId, text, source, tz = 'Europe/Moscow') {
  const z = zonedParts(tz);
  const ctx = await loadContext(env.DB, userId, z.date);
  const parsed = await parseTasks(env, text, { ...ctx, tz });
  const now = Date.now();
  const rows = parsed.tasks.map((t, i) => ({
    ...t,
    id: newId(),
    slot: t.time ? (toMin(t.time) < 720 ? 'morning' : toMin(t.time) < 1020 ? 'afternoon' : 'evening') : 'anytime',
    source,
    done: false,
    deleted: false,
    checklist: [],
    created_at: now + i,
    updated_at: now + i,
  }));
  if (rows.length) await upsertTasks(env.DB, userId, rows);
  return { ...parsed, tasks: rows };
}

async function downloadFile(env, fileId) {
  const f = await tg(env, 'getFile', { file_id: fileId });
  if (!f || !f.ok) throw new Error('getFile failed');
  const r = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${f.result.file_path}`);
  if (!r.ok) throw new Error('download failed');
  return r.arrayBuffer();
}

export async function handleWebhook(request, env, ctx) {
  if (!env.BOT_TOKEN) return new Response('bot not configured', { status: 503 });
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== (await webhookSecret(env.BOT_TOKEN))) return new Response('forbidden', { status: 403 });
  let update;
  try { update = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const origin = new URL(request.url).origin;
  // Отвечаем Telegram сразу, обработка — в фоне
  ctx.waitUntil(processUpdate(update, env, origin).catch((e) => console.log('update error', e && e.stack)));
  return new Response('ok');
}

export async function processUpdate(update, env, origin) {
  if (update.callback_query) return handleCallback(update.callback_query, env, origin);
  const msg = update.message;
  if (!msg || !msg.from || msg.chat?.type !== 'private') return;
  const uid = String(msg.from.id);
  const chatId = msg.chat.id;
  if (!isAllowed(env, uid)) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Этот планер личный — доступ закрыт.' });
    return;
  }
  const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
  const user = await ensureUser(env.DB, uid, { name, chatId });
  const tz = user.tz || 'Europe/Moscow';
  const text = (msg.text || msg.caption || '').trim();

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await tg(env, 'sendMessage', {
      chat_id: chatId, parse_mode: 'HTML', reply_markup: openBtn(origin),
      text: 'Привет! Это твой планер.\n\nОтправь голосовое или текст — например, <i>«завтра в 16:00 созвон на полтора часа, а в пятницу сдать отчёт»</i> — и я разложу это по задачам.\n\n/today — задачи на сегодня',
    });
    return;
  }
  if (text.startsWith('/today')) {
    const z = zonedParts(tz);
    const r = await env.DB.prepare(`SELECT * FROM tasks WHERE user_id = ? AND deleted = 0 AND date = ? ORDER BY time IS NULL, time, priority`).bind(uid, z.date).all();
    const list = (r.results || []).map(taskOut);
    const lines = list.length
      ? list.map((t) => `${t.done ? '✓' : '○'} ${t.time ? t.time + ' ' : ''}${esc(t.title)}${t.frog ? ' — <b>главное</b>' : ''}`).join('\n')
      : 'На сегодня задач нет.';
    await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `<b>Сегодня, ${fmtDate(z.date, { weekday: true })}</b>\n\n${lines}`, reply_markup: openBtn(origin) });
    return;
  }

  let input = text;
  let source = 'api';
  let heard = '';
  const media = msg.voice || msg.audio || msg.video_note;
  if (media) {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    if (!env.AI) {
      await tg(env, 'sendMessage', { chat_id: chatId, text: 'Распознавание речи недоступно: нет биндинга Workers AI.' });
      return;
    }
    try {
      const buf = await downloadFile(env, media.file_id);
      heard = await transcribe(env, buf);
    } catch (e) {
      console.log('voice error', e && e.message);
      await tg(env, 'sendMessage', { chat_id: chatId, text: 'Не получилось распознать голосовое. Попробуй ещё раз или напиши текстом.' });
      return;
    }
    if (!heard) {
      await tg(env, 'sendMessage', { chat_id: chatId, text: 'Не расслышал. Попробуй ещё раз.' });
      return;
    }
    input = heard;
    source = 'voice';
  } else if (!input) {
    return;
  } else {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  const ai = env.AI || { run: async () => { throw new Error('no AI'); } };
  const res = await addTasksFromText({ ...env, AI: ai }, uid, input, source, tz);
  let reply = '';
  if (heard) reply += `<i>«${esc(heard)}»</i>\n\n`;
  if (!res.tasks.length) {
    reply += 'Не нашёл задач в сообщении. Попробуй сформулировать иначе.';
  } else {
    const n = res.tasks.length;
    reply += `Добавил ${n} ${n === 1 ? 'задачу' : n < 5 ? 'задачи' : 'задач'}:\n` + res.tasks.map((t) => describeTask(t, res.today)).join('\n');
    if (res.summary) reply += `\n\n${esc(res.summary)}`;
  }
  await tg(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: reply, reply_markup: openBtn(origin) });
}

async function handleCallback(cq, env, origin) {
  const data = String(cq.data || '');
  const uid = String(cq.from.id);
  const m = data.match(/^hab:(.+):(\d{4}-\d{2}-\d{2})$/);
  if (!m || !isAllowed(env, uid)) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }
  const [, habitId, date] = m;
  const h = await env.DB.prepare(`SELECT data FROM items WHERE user_id = ? AND id = ? AND kind = 'habit'`).bind(uid, habitId).first();
  if (!h) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'Привычка не найдена' });
    return;
  }
  await upsertItems(env.DB, uid, [{ id: habitLogId(habitId, date), kind: 'habit_log', data: { habit: habitId, date, done: true }, deleted: false, updated_at: Date.now() }]);
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'Отмечено' });
  if (cq.message) {
    let name = '';
    try { name = JSON.parse(h.data).name; } catch { /* */ }
    await tg(env, 'editMessageText', {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: 'HTML',
      text: `Привычка <b>${esc(name)}</b> — отмечено ✓`, reply_markup: openBtn(origin),
    });
  }
}

export async function setupBot(env, origin) {
  if (!env.BOT_TOKEN) throw new Error('Не задан секрет BOT_TOKEN');
  const results = {};
  results.webhook = await tg(env, 'setWebhook', {
    url: `${origin}/api/telegram/webhook`,
    secret_token: await webhookSecret(env.BOT_TOKEN),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  results.menu = await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Планер', web_app: { url: origin + '/' } } });
  results.commands = await tg(env, 'setMyCommands', {
    commands: [
      { command: 'start', description: 'Как пользоваться' },
      { command: 'today', description: 'Задачи на сегодня' },
    ],
  });
  results.me = await tg(env, 'getMe', {});
  const ok = results.webhook?.ok && results.menu?.ok && results.commands?.ok;
  return { ok: !!ok, username: results.me?.result?.username || null, errors: Object.entries(results).filter(([, v]) => !v?.ok).map(([k, v]) => `${k}: ${v?.description || 'ошибка'}`) };
}

// Cron: напоминания о привычках
export async function habitReminders(env, origin, now = new Date(), limit = 10) {
  if (!env.BOT_TOKEN) return 0;
  const r = await env.DB.prepare(
    `SELECT i.user_id, i.id, i.data, u.chat_id, u.tz FROM items i JOIN users u ON u.user_id = i.user_id
     WHERE i.kind = 'habit' AND i.deleted = 0 AND u.chat_id IS NOT NULL AND json_extract(i.data, '$.remind') IS NOT NULL`,
  ).all();
  let sent = 0;
  for (const row of r.results || []) {
    if (sent >= limit) break;
    let h;
    try { h = JSON.parse(row.data); } catch { continue; }
    if (!h.remind || h.archived || !/^\d{2}:\d{2}$/.test(h.remind)) continue;
    const z = zonedParts(row.tz || 'Europe/Moscow', now);
    const diff = z.min - toMin(h.remind);
    if (diff < 0 || diff >= 30) continue;
    if (!habitDue(h, z.date)) continue;
    const done = await env.DB.prepare(`SELECT 1 AS x FROM items WHERE user_id = ? AND id = ? AND deleted = 0`).bind(row.user_id, habitLogId(row.id, z.date)).first();
    if (done) continue;
    const ins = await env.DB.prepare(`INSERT OR IGNORE INTO reminders_sent (user_id, habit_id, date) VALUES (?, ?, ?)`).bind(row.user_id, row.id, z.date).run();
    if (!ins.meta?.changes) continue;
    await tg(env, 'sendMessage', {
      chat_id: row.chat_id, parse_mode: 'HTML',
      text: `Напоминание: <b>${esc(h.name)}</b>`,
      reply_markup: { inline_keyboard: [[{ text: 'Отметить', callback_data: `hab:${row.id}:${z.date}`.slice(0, 64) }, { text: 'Открыть планер', web_app: { url: origin + '/' } }]] },
    });
    sent++;
  }
  return sent;
}
