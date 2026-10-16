// Схема D1 создаётся кодом при первом запросе. Новые колонки добавляются через ALTER TABLE.

const TABLES = {
  users: {
    create: `CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, key TEXT UNIQUE, created_at INTEGER)`,
    columns: {
      name: 'TEXT', chat_id: 'TEXT', tz: "TEXT DEFAULT 'Europe/Moscow'",
      notion_token: 'TEXT', notion_db: 'TEXT', notion_cursor: 'INTEGER DEFAULT 0', notion_error: 'TEXT',
      updated_at: 'INTEGER',
    },
  },
  tasks: {
    create: `CREATE TABLE IF NOT EXISTS tasks (id TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, id))`,
    columns: {
      date: 'TEXT', time: 'TEXT', slot: "TEXT DEFAULT 'anytime'", duration_min: 'INTEGER', area: 'TEXT',
      priority: 'INTEGER DEFAULT 2', note: "TEXT DEFAULT ''", deep: 'INTEGER DEFAULT 0', frog: 'INTEGER DEFAULT 0',
      repeat: 'TEXT', checklist: 'TEXT', done: 'INTEGER DEFAULT 0', deleted: 'INTEGER DEFAULT 0',
      source: "TEXT DEFAULT 'app'", created_at: 'INTEGER',
    },
  },
  items: {
    create: `CREATE TABLE IF NOT EXISTS items (id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT, deleted INTEGER DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, id))`,
    columns: {},
  },
  counters: {
    create: `CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`,
    columns: {},
  },
  notion_map: {
    create: `CREATE TABLE IF NOT EXISTS notion_map (user_id TEXT NOT NULL, task_id TEXT NOT NULL, page_id TEXT NOT NULL, PRIMARY KEY (user_id, task_id))`,
    columns: {},
  },
  config: {
    create: `CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT)`,
    columns: {},
  },
  reminders_sent: {
    create: `CREATE TABLE IF NOT EXISTS reminders_sent (user_id TEXT NOT NULL, habit_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (user_id, habit_id, date))`,
    columns: {},
  },
};

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS tasks_user_rev ON tasks (user_id, rev)`,
  `CREATE INDEX IF NOT EXISTS items_user_rev ON items (user_id, rev)`,
  `CREATE INDEX IF NOT EXISTS items_kind ON items (kind)`,
  `INSERT OR IGNORE INTO counters (k, v) VALUES ('rev', 0)`,
];

let ready = null;

export function ensureSchema(db) {
  if (!ready) {
    ready = migrate(db).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export function resetSchemaFlag() { ready = null; }

async function migrate(db) {
  await db.batch(Object.values(TABLES).map((t) => db.prepare(t.create)));
  const alters = [];
  for (const [name, t] of Object.entries(TABLES)) {
    const cols = Object.keys(t.columns);
    if (!cols.length) continue;
    const info = await db.prepare(`PRAGMA table_info(${name})`).all();
    const have = new Set((info.results || []).map((c) => c.name));
    for (const c of cols) if (!have.has(c)) alters.push(db.prepare(`ALTER TABLE ${name} ADD COLUMN ${c} ${t.columns[c]}`));
  }
  if (alters.length) for (const a of alters) await a.run();
  await db.batch(INDEXES.map((s) => db.prepare(s)));
}

// ——— Задачи ———
const TASK_COLS = ['id', 'user_id', 'title', 'date', 'time', 'slot', 'duration_min', 'area', 'priority', 'note',
  'deep', 'frog', 'repeat', 'checklist', 'done', 'deleted', 'source', 'created_at', 'updated_at'];

const str = (v, max = 500) => (v == null ? null : String(v).slice(0, max));
const int = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
const bool = (v) => (v ? 1 : 0);
const json = (v) => (v == null ? null : typeof v === 'string' ? v.slice(0, 20000) : JSON.stringify(v).slice(0, 20000));

export function cleanTask(t, userId, now = Date.now()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null;
  const time = /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : null;
  const prio = int(t.priority);
  return {
    id: str(t.id, 80),
    user_id: userId,
    title: str(t.title || '', 500) || '',
    date, time,
    slot: ['morning', 'afternoon', 'evening', 'anytime'].includes(t.slot) ? t.slot : 'anytime',
    duration_min: int(t.duration_min) && int(t.duration_min) > 0 ? Math.min(int(t.duration_min), 24 * 60) : null,
    area: str(t.area, 60),
    priority: prio >= 1 && prio <= 3 ? prio : 2,
    note: str(t.note || '', 5000),
    deep: bool(t.deep), frog: bool(t.frog),
    repeat: json(t.repeat), checklist: json(t.checklist),
    done: bool(t.done), deleted: bool(t.deleted),
    source: ['app', 'voice', 'api'].includes(t.source) ? t.source : 'app',
    created_at: int(t.created_at) || now,
    updated_at: int(t.updated_at) || now,
  };
}

export function taskOut(r) {
  if (!r) return r;
  const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
  return {
    id: r.id, title: r.title, date: r.date, time: r.time, slot: r.slot, duration_min: r.duration_min,
    area: r.area, priority: r.priority, note: r.note || '', deep: !!r.deep, frog: !!r.frog,
    repeat: parse(r.repeat, null), checklist: parse(r.checklist, []), done: !!r.done, deleted: !!r.deleted,
    source: r.source, created_at: r.created_at, updated_at: r.updated_at, rev: r.rev,
  };
}

export function itemOut(r) {
  let data = {};
  try { data = r.data ? JSON.parse(r.data) : {}; } catch { /* битые данные */ }
  return { id: r.id, kind: r.kind, data, deleted: !!r.deleted, updated_at: r.updated_at, rev: r.rev };
}

// Last-write-wins по updated_at. Ревизии выдаются в той же транзакции (batch), что и запись.
export async function upsertTasks(db, userId, list) {
  if (!list.length) return { accepted: [], rejected: [] };
  const rows = list.map((t) => cleanTask(t, userId)).filter((t) => t.id);
  const n = rows.length;
  const placeholders = TASK_COLS.map(() => '?').join(',');
  const updates = TASK_COLS.filter((c) => !['id', 'user_id', 'created_at'].includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
  const stmts = [db.prepare(`UPDATE counters SET v = v + ? WHERE k = 'rev'`).bind(n)];
  rows.forEach((r, i) => {
    stmts.push(db.prepare(
      `INSERT INTO tasks (${TASK_COLS.join(',')}, rev) VALUES (${placeholders}, (SELECT v FROM counters WHERE k = 'rev') - ?)
       ON CONFLICT (user_id, id) DO UPDATE SET ${updates}, rev = excluded.rev WHERE excluded.updated_at > tasks.updated_at`,
    ).bind(...TASK_COLS.map((c) => r[c]), n - 1 - i));
  });
  const res = await db.batch(stmts);
  const accepted = [];
  const rejectedIds = [];
  rows.forEach((r, i) => ((res[i + 1].meta?.changes || 0) > 0 ? accepted : rejectedIds).push(r.id));
  let rejected = [];
  if (rejectedIds.length) {
    const q = await db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND id IN (${rejectedIds.map(() => '?').join(',')})`)
      .bind(userId, ...rejectedIds).all();
    rejected = (q.results || []).map(taskOut);
  }
  return { accepted, rejected };
}

export async function upsertItems(db, userId, list) {
  const rows = list.filter((i) => i && i.id && i.kind).map((i) => ({
    id: str(i.id, 120), user_id: userId, kind: str(i.kind, 30),
    data: json(i.data || {}), deleted: bool(i.deleted), updated_at: int(i.updated_at) || Date.now(),
  }));
  if (!rows.length) return { accepted: [], rejected: [] };
  const n = rows.length;
  const stmts = [db.prepare(`UPDATE counters SET v = v + ? WHERE k = 'rev'`).bind(n)];
  rows.forEach((r, i) => {
    stmts.push(db.prepare(
      `INSERT INTO items (id, user_id, kind, data, deleted, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?, (SELECT v FROM counters WHERE k = 'rev') - ?)
       ON CONFLICT (user_id, id) DO UPDATE SET kind = excluded.kind, data = excluded.data, deleted = excluded.deleted,
       updated_at = excluded.updated_at, rev = excluded.rev WHERE excluded.updated_at > items.updated_at`,
    ).bind(r.id, r.user_id, r.kind, r.data, r.deleted, r.updated_at, n - 1 - i));
  });
  const res = await db.batch(stmts);
  const accepted = [];
  const rejectedIds = [];
  rows.forEach((r, i) => ((res[i + 1].meta?.changes || 0) > 0 ? accepted : rejectedIds).push(r.id));
  let rejected = [];
  if (rejectedIds.length) {
    const q = await db.prepare(`SELECT * FROM items WHERE user_id = ? AND id IN (${rejectedIds.map(() => '?').join(',')})`)
      .bind(userId, ...rejectedIds).all();
    rejected = (q.results || []).map(itemOut);
  }
  return { accepted, rejected };
}

export async function currentRev(db) {
  const r = await db.prepare(`SELECT v FROM counters WHERE k = 'rev'`).first();
  return r ? r.v : 0;
}

export async function getConfig(db, k) {
  const r = await db.prepare('SELECT v FROM config WHERE k = ?').bind(k).first();
  return r ? r.v : null;
}

export async function setConfig(db, k, v) {
  await db.prepare('INSERT INTO config (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind(k, v).run();
}
