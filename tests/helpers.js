// D1-совместимая обёртка над node:sqlite и подмена внешних API для тестов.
import { DatabaseSync } from 'node:sqlite';
import { resetSchemaFlag } from '../server/db.js';

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const returnsRows = (sql) => /^\s*(select|pragma|with)/i.test(sql) || /\breturning\b/i.test(sql);

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p.map(norm)); }
  _exec() {
    const st = this.db.prepare(this.sql);
    if (returnsRows(this.sql)) {
      const results = st.all(...this.params).map((r) => ({ ...r }));
      return { success: true, results, meta: { changes: 0 } };
    }
    const r = st.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async all() { return this._exec(); }
  async run() { return this._exec(); }
  async first(col) {
    const r = this._exec().results[0] || null;
    return r && col ? r[col] : r;
  }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  resetSchemaFlag();
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s._exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}

export function makeCtx() {
  const waits = [];
  return { waitUntil: (p) => waits.push(p), passThroughOnException() {}, flush: () => Promise.all(waits.splice(0)) };
}

// Подмена fetch: handlers — массив [predicate(url, init), responder(url, init, body)]
export function mockFetch(handlers) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    let body = init.body;
    try { body = body ? JSON.parse(body) : undefined; } catch { /* binary */ }
    calls.push({ url, method: init.method || 'GET', body });
    for (const [pred, resp] of handlers) {
      if (pred(url, init)) {
        const r = await resp(url, init, body);
        if (r instanceof Response) return r;
        return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ ok: false, error: 'unmocked ' + url }), { status: 599 });
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

export async function signInitData(botToken, user, authDate = Math.floor(Date.now() / 1000)) {
  const enc = new TextEncoder();
  const imp = (k) => crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAE', user: JSON.stringify(user) });
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', await imp(enc.encode('WebAppData')), enc.encode(botToken)));
  const hash = [...new Uint8Array(await crypto.subtle.sign('HMAC', await imp(secret), enc.encode(check)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  params.set('hash', hash);
  return params.toString();
}

export function req(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request('https://planner.test' + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
