// Интеграционный тест бота и Notion на node:sqlite с подменой Telegram, Workers AI и Notion API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { runCron } from '../server/worker.js';
import { webhookSecret } from '../server/auth.js';
import { zonedParts, addDays } from '../shared/dates.js';
import { makeD1, makeCtx, mockFetch, req } from './helpers.js';

const BOT = '123456:TEST-token';
const TG = (m) => (u) => u.startsWith(`https://api.telegram.org/bot${BOT}/${m}`);

function fakeAI({ jsonModeFails = false, tasks } = {}) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      if (model.includes('whisper')) {
        assert.equal(input.language, 'ru');
        assert.ok(typeof input.audio === 'string' && input.audio.length > 0);
        return { text: 'Завтра в 16:00 созвон на полтора часа и купить молоко' };
      }
      if (input.response_format && jsonModeFails) return { response: 'не json' };
      const today = zonedParts('Europe/Moscow').date;
      const payload = { tasks: tasks || [
        { title: 'созвон', date: addDays(today, 1), time: '16:00', duration_min: 90, area: 'работа', priority: 2, frog: false, deep: false, note: '' },
        { title: 'Купить молоко', date: null, time: null, duration_min: null, priority: 3 },
      ], summary: 'Две задачи: созвон и покупки.' };
      // без response_format модель отвечает текстом с JSON внутри
      return input.response_format ? { response: payload } : { response: 'Вот результат:\n```json\n' + JSON.stringify(payload) + '\n```' };
    },
  };
}

async function setup(aiOpts) {
  const env = { DB: makeD1(), BOT_TOKEN: BOT, SERVICE_KEY: 'svc', AI: fakeAI(aiOpts) };
  const ctx = makeCtx();
  const secret = await webhookSecret(BOT);
  const hook = async (update, s = secret) => {
    const r = await worker.fetch(req('/api/telegram/webhook', { method: 'POST', body: update, headers: { 'X-Telegram-Bot-Api-Secret-Token': s } }), env, ctx);
    await ctx.flush();
    return r;
  };
  return { env, ctx, hook };
}

const msg = (extra) => ({ update_id: 1, message: { message_id: 5, from: { id: 42, first_name: 'Марк' }, chat: { id: 42, type: 'private' }, date: 1, ...extra } });

test('вебхук без секрета — 403, с секретом отвечает сразу', async () => {
  const m = mockFetch([[TG(''), () => ({ ok: true, result: {} })]]);
  try {
    const { hook } = await setup();
    assert.equal((await hook(msg({ text: '/start' }), 'wrong')).status, 403);
    const r = await hook(msg({ text: '/start' }));
    assert.equal(r.status, 200);
    const sent = m.calls.find((c) => c.url.endsWith('/sendMessage'));
    assert.match(sent.body.text, /Привет/);
    assert.ok(sent.body.reply_markup.inline_keyboard[0][0].web_app.url.startsWith('https://planner.test'));
  } finally { m.restore(); }
});

test('голосовое → Whisper → Llama (JSON-режим) → задачи + кнопка web_app', async () => {
  const m = mockFetch([
    [TG('getFile'), () => ({ ok: true, result: { file_path: 'voice/file_1.oga' } })],
    [(u) => u.includes('/file/bot'), () => new Response(new Uint8Array([1, 2, 3, 4, 5]))],
    [TG(''), () => ({ ok: true, result: {} })],
  ]);
  try {
    const { hook, env } = await setup();
    await hook(msg({ voice: { file_id: 'F1', duration: 3 } }));
    const rows = (await env.DB.prepare('SELECT * FROM tasks WHERE user_id = ?').bind('42').all()).results;
    assert.equal(rows.length, 2);
    const call = rows.find((r) => r.title === 'Созвон');
    assert.equal(call.time, '16:00');
    assert.equal(call.duration_min, 90);
    assert.equal(call.source, 'voice');
    assert.equal(call.slot, 'afternoon');
    assert.ok(call.rev > 0);
    const reply = m.calls.filter((c) => c.url.endsWith('/sendMessage')).pop().body;
    assert.match(reply.text, /Добавил 2 задачи/);
    assert.match(reply.text, /полтора часа/);
    assert.equal(reply.reply_markup.inline_keyboard[0][0].text, 'Открыть планер');
    const llm = env.AI.calls.find((c) => c.model.includes('llama'));
    assert.ok(llm.input.response_format);
    assert.match(llm.input.messages[0].content, /Europe\/Moscow/);
  } finally { m.restore(); }
});

test('модель не выдержала схему → повтор без response_format, JSON вытаскивается из текста', async () => {
  const m = mockFetch([[TG(''), () => ({ ok: true, result: {} })]]);
  try {
    const { hook, env } = await setup({ jsonModeFails: true });
    await hook(msg({ text: 'завтра созвон в 16 и молоко' }));
    const llm = env.AI.calls.filter((c) => c.model.includes('llama'));
    assert.equal(llm.length, 2);
    assert.equal(llm[1].input.response_format, undefined);
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM tasks').first()).n;
    assert.equal(n, 2);
  } finally { m.restore(); }
});

test('без ИИ — запасной разбор локальным парсером', async () => {
  const m = mockFetch([[TG(''), () => ({ ok: true, result: {} })]]);
  try {
    const { hook, env } = await setup();
    env.AI = { run: async () => { throw new Error('down'); } };
    await hook(msg({ text: 'отчёт 20.10 в 11:00 #работа' }));
    const r = await env.DB.prepare('SELECT * FROM tasks').first();
    assert.equal(r.title, 'Отчёт');
    assert.equal(r.time, '11:00');
    assert.match(r.date, /-10-20$/);
  } finally { m.restore(); }
});

test('setup: setWebhook с секретом, кнопка меню web_app, команды', async () => {
  const m = mockFetch([
    [TG('getMe'), () => ({ ok: true, result: { username: 'my_planner_bot' } })],
    [TG(''), () => ({ ok: true, result: true })],
  ]);
  try {
    const { env, ctx } = await setup();
    const svc = { 'X-Service-Key': 'svc', 'X-Telegram-User-Id': '42' };
    const r = await worker.fetch(req('/api/telegram/setup', { method: 'POST', headers: svc }), env, ctx);
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.username, 'my_planner_bot');
    const wh = m.calls.find((c) => c.url.endsWith('/setWebhook')).body;
    assert.equal(wh.url, 'https://planner.test/api/telegram/webhook');
    assert.equal(wh.secret_token, await webhookSecret(BOT));
    assert.equal(m.calls.find((c) => c.url.endsWith('/setChatMenuButton')).body.menu_button.type, 'web_app');
    assert.ok(m.calls.find((c) => c.url.endsWith('/setMyCommands')));
  } finally { m.restore(); }
});

test('напоминание о привычке и отметка кнопкой', async () => {
  const m = mockFetch([[TG(''), () => ({ ok: true, result: {} })]]);
  try {
    const { env, hook } = await setup();
    await hook(msg({ text: '/start' }));
    const now = new Date();
    const z = zonedParts('Europe/Moscow', now);
    const remind = z.time;
    await env.DB.prepare(`INSERT INTO items (id, user_id, kind, data, deleted, updated_at, rev) VALUES ('h1', '42', 'habit', ?, 0, 1, 1)`)
      .bind(JSON.stringify({ name: 'Зарядка', days: [1, 2, 3, 4, 5, 6, 7], remind })).run();
    const { setConfig } = await import('../server/db.js');
    await setConfig(env.DB, 'origin', 'https://planner.test');
    let r = await runCron(env, now);
    assert.equal(r.reminders, 1);
    const sent = m.calls.filter((c) => c.url.endsWith('/sendMessage')).pop().body;
    assert.match(sent.text, /Зарядка/);
    const cb = sent.reply_markup.inline_keyboard[0][0].callback_data;
    assert.equal(cb, `hab:h1:${z.date}`);
    // повторно в тот же день не шлём
    r = await runCron(env, now);
    assert.equal(r.reminders, 0);
    await hook({ update_id: 2, callback_query: { id: 'q', from: { id: 42 }, data: cb, message: { message_id: 9, chat: { id: 42 } } } });
    const log = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(`hl:h1:${z.date}`).first();
    assert.ok(log && !log.deleted);
    assert.ok(m.calls.find((c) => c.url.endsWith('/answerCallbackQuery')));
  } finally { m.restore(); }
});

test('Notion: создание базы, синк по курсору, архивирование, лимит 35 запросов', async () => {
  let pageN = 0;
  const m = mockFetch([
    [(u, i) => u.includes('api.notion.com/v1/pages/') && (i.method || 'GET') === 'GET', () => ({ id: 'p' })],
    [(u) => u.endsWith('api.notion.com/v1/databases'), (u, i, b) => {
      assert.equal(b.title[0].text.content, 'Планер');
      assert.deepEqual(Object.keys(b.properties), ['Задача', 'Когда', 'Готово', 'Сфера', 'Минут', 'Главное']);
      assert.equal(b.parent.page_id, '1234abcd-1234-1234-1234-1234567890ab');
      return { id: 'db-1', url: 'https://notion.so/db1' };
    }],
    [(u) => u.endsWith('api.notion.com/v1/pages'), () => ({ id: `page-${++pageN}` })],
    [(u) => /api\.notion\.com\/v1\/pages\/page-/.test(u), () => ({ ok: true })],
  ]);
  try {
    const { env, ctx } = await setup();
    const H = { 'X-Service-Key': 'svc', 'X-Telegram-User-Id': '42' };
    const call = async (p, o = {}) => (await worker.fetch(req(p, { ...o, headers: H }), env, ctx)).json();
    const c = await call('/api/notion/connect', { method: 'POST', body: { token: 'secret_x', page: 'https://www.notion.so/My-page-1234abcd1234123412341234567890ab?pvs=4' } });
    assert.equal(c.ok, true, JSON.stringify(c));

    const tasks = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, title: `Задача ${i}`, date: '2026-10-20', time: i === 0 ? '10:00' : null, duration_min: i === 0 ? 60 : null, area: 'работа', updated_at: 100 + i }));
    tasks.push({ id: 'nodate', title: 'Без даты', updated_at: 500 });
    await call('/api/tasks/sync', { method: 'POST', body: { tasks } });

    let r = await runCron(env);
    assert.equal(r.notion.requests, 35);
    assert.equal(r.notion.created, 35);
    const first = m.calls.find((x) => x.url.endsWith('/v1/pages') && x.body.properties['Задача'].title[0].text.content === 'Задача 0').body;
    assert.deepEqual(first.properties['Когда'].date, { start: '2026-10-20T10:00:00', time_zone: 'Europe/Moscow', end: '2026-10-20T11:00:00' });
    assert.equal(first.properties['Сфера'].select.name, 'работа');

    r = await runCron(env);
    assert.equal(r.notion.created, 5);
    r = await runCron(env);
    assert.equal(r.notion.requests, 0);

    // удаление → архив, правка → PATCH
    await call('/api/tasks/sync', { method: 'POST', body: { tasks: [{ ...tasks[1], deleted: true, updated_at: 1000 }, { ...tasks[2], done: true, updated_at: 1000 }] } });
    r = await runCron(env);
    assert.equal(r.notion.archived, 1);
    assert.equal(r.notion.updated, 1);
    const arch = m.calls.filter((x) => x.method === 'PATCH' && x.body.archived === true);
    assert.equal(arch.length, 1);
  } finally { m.restore(); }
});
