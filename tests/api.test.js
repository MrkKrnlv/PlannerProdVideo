// Smoke-тест API: авторизация, синк задач и items, LWW, надгробия, ревизии, сервисный ключ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import { makeD1, makeCtx, req, signInitData, mockFetch } from './helpers.js';

// Telegram API не трогаем по-настоящему (авто-настройка вебхука)
mockFetch([[() => true, () => ({ ok: true, result: {} })]]);

const BOT = '123456:TEST-token';

function setup() {
  const env = { DB: makeD1(), BOT_TOKEN: BOT, SERVICE_KEY: 'svc-secret' };
  const ctx = makeCtx();
  const call = async (path, opts) => {
    const r = await worker.fetch(req(path, opts), env, ctx);
    return { status: r.status, data: await r.json() };
  };
  return { env, ctx, call };
}

async function login(call, id = 42, name = 'Марк') {
  const initData = await signInitData(BOT, { id, first_name: name });
  const r = await call('/api/auth/telegram', { method: 'POST', body: { initData } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.key;
}

test('health и 401 без ключа', async () => {
  const { call } = setup();
  assert.equal((await call('/api/health')).data.ok, true);
  assert.equal((await call('/api/tasks/sync?since=0')).status, 401);
});

test('initData: верная подпись даёт ключ, подделка — 401', async () => {
  const { call } = setup();
  const key = await login(call);
  assert.match(key, /^pk_/);
  const bad = (await signInitData('999:other', { id: 42, first_name: 'X' }));
  assert.equal((await call('/api/auth/telegram', { method: 'POST', body: { initData: bad } })).status, 401);
  const old = await signInitData(BOT, { id: 42 }, Math.floor(Date.now() / 1000) - 30 * 86400);
  assert.equal((await call('/api/auth/telegram', { method: 'POST', body: { initData: old } })).status, 401);
  // повторный вход — тот же ключ
  assert.equal(await login(call), key);
});

test('синк задач: push, pull по rev, last-write-wins, надгробия', async () => {
  const { call } = setup();
  const key = await login(call);
  const H = { Authorization: `Bearer ${key}` };
  const t1 = { id: 'a1', title: 'Созвон', date: '2026-10-16', time: '16:00', duration_min: 90, updated_at: 1000, checklist: [{ id: 'c', text: 'x', done: false }], repeat: null, frog: true };
  let r = await call('/api/tasks/sync', { method: 'POST', headers: H, body: { tasks: [t1, { id: 'a2', title: 'Отчёт', updated_at: 1000 }] } });
  assert.deepEqual(r.data.accepted, ['a1', 'a2']);
  const rev1 = r.data.rev;

  r = await call('/api/tasks/sync?since=0', { headers: H });
  assert.equal(r.data.tasks.length, 2);
  assert.equal(r.data.tasks[0].frog, true);
  assert.deepEqual(r.data.tasks[0].checklist, [{ id: 'c', text: 'x', done: false }]);
  assert.equal(r.data.rev, rev1);

  // устаревшая правка отклоняется и возвращается серверная версия
  r = await call('/api/tasks/sync', { method: 'POST', headers: H, body: { tasks: [{ ...t1, title: 'Старое', updated_at: 500 }] } });
  assert.deepEqual(r.data.accepted, []);
  assert.equal(r.data.rejected[0].title, 'Созвон');

  // свежая правка проходит, pull с since отдаёт только её
  r = await call('/api/tasks/sync', { method: 'POST', headers: H, body: { tasks: [{ ...t1, title: 'Созвон с командой', updated_at: 2000 }] } });
  assert.deepEqual(r.data.accepted, ['a1']);
  r = await call(`/api/tasks/sync?since=${rev1}`, { headers: H });
  assert.equal(r.data.tasks.length, 1);
  assert.equal(r.data.tasks[0].title, 'Созвон с командой');

  // надгробие: старая версия без deleted не воскрешает
  await call('/api/tasks/sync', { method: 'POST', headers: H, body: { tasks: [{ id: 'a2', title: 'Отчёт', deleted: true, updated_at: 3000 }] } });
  r = await call('/api/tasks/sync', { method: 'POST', headers: H, body: { tasks: [{ id: 'a2', title: 'Отчёт', updated_at: 2500 }] } });
  assert.deepEqual(r.data.accepted, []);
  assert.equal(r.data.rejected[0].deleted, true);
});

test('изоляция пользователей и items', async () => {
  const { call } = setup();
  const k1 = await login(call, 1, 'A');
  const k2 = await login(call, 2, 'B');
  await call('/api/items/sync', { method: 'POST', headers: { Authorization: `Bearer ${k1}` }, body: { items: [{ id: 'hl:h1:2026-10-16', kind: 'habit_log', data: { habit: 'h1', date: '2026-10-16' }, updated_at: 10 }] } });
  // одинаковый id у другого пользователя — отдельная запись
  await call('/api/items/sync', { method: 'POST', headers: { Authorization: `Bearer ${k2}` }, body: { items: [{ id: 'hl:h1:2026-10-16', kind: 'habit_log', data: { habit: 'h1', date: '2026-10-16', other: 1 }, updated_at: 5 }] } });
  const a = await call('/api/items/sync?since=0', { headers: { Authorization: `Bearer ${k1}` } });
  const b = await call('/api/items/sync?since=0', { headers: { Authorization: `Bearer ${k2}` } });
  assert.equal(a.data.items.length, 1);
  assert.equal(a.data.items[0].data.other, undefined);
  assert.equal(b.data.items[0].data.other, 1);
});

test('сервисный ключ и API для автоматизаций', async () => {
  const { call } = setup();
  const H = { 'X-Service-Key': 'svc-secret', 'X-Telegram-User-Id': '77' };
  let r = await call('/api/tasks', { method: 'POST', headers: H, body: { text: 'созвон 1.5ч в 16:00 20.10 #работа !' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const t = r.data.tasks[0];
  assert.equal(t.title, 'Созвон');
  assert.equal(t.time, '16:00');
  assert.equal(t.duration_min, 90);
  assert.equal(t.area, 'работа');
  assert.equal(t.priority, 1);
  assert.equal(t.source, 'api');
  assert.match(t.date, /-10-20$/);
  assert.equal((await call('/api/tasks', { headers: { ...H, 'X-Service-Key': 'wrong' } })).status, 401);
  r = await call('/api/tasks', { headers: H });
  assert.equal(r.data.tasks.length, 1);
});

test('ALLOWED_USERS ограничивает вход', async () => {
  const { call, env } = setup();
  env.ALLOWED_USERS = '5';
  const initData = await signInitData(BOT, { id: 6, first_name: 'X' });
  assert.equal((await call('/api/auth/telegram', { method: 'POST', body: { initData } })).status, 403);
});

test('ротация ключа', async () => {
  const { call } = setup();
  const key = await login(call);
  const r = await call('/api/me/rotate-key', { method: 'POST', headers: { Authorization: `Bearer ${key}` } });
  assert.notEqual(r.data.key, key);
  assert.equal((await call('/api/me', { headers: { Authorization: `Bearer ${key}` } })).status, 401);
  assert.equal((await call('/api/me', { headers: { Authorization: `Bearer ${r.data.key}` } })).status, 200);
});
