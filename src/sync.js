// Синк: push грязных записей через ~1 с, pull по серверной ревизии (при фокусе, в сети, раз в 30 с).
import { create } from 'zustand';
import { useData } from './store.js';

export const useSync = create(() => ({ status: 'idle', error: null, last: null, online: typeof navigator === 'undefined' ? true : navigator.onLine }));

const API = '';
let pushTimer = null;
let running = false;
let again = false;

export async function api(path, { method = 'GET', body, key } = {}) {
  const k = key ?? useData.getState().auth.key;
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(k ? { Authorization: `Bearer ${k}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* не json */ }
  if (!r.ok) {
    const e = new Error((data && data.error) || `Ошибка ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}

const strip = ({ rev, ...rest }) => rest;

async function push(table) {
  const st = useData.getState();
  const ids = Object.keys(st.dirty[table]);
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const cur = useData.getState();
    const records = chunk.map((id) => cur[table][id]).filter(Boolean);
    const sent = Object.fromEntries(records.map((r) => [r.id, r.updated_at]));
    const res = await api(`/api/${table}/sync`, { method: 'POST', body: { [table]: records } });
    useData.setState((s) => {
      const dirty = { ...s.dirty[table] };
      const map = { ...s[table] };
      for (const id of res.accepted || []) if (dirty[id] === sent[id]) delete dirty[id];
      for (const row of res.rejected || []) {
        const local = map[row.id];
        if (!local || local.updated_at <= row.updated_at) {
          map[row.id] = strip(row);
          delete dirty[row.id];
        }
      }
      // записи, которых нет ни в accepted, ни в rejected (битые) — не гоняем вечно
      for (const id of chunk) if (!(res.accepted || []).includes(id) && !(res.rejected || []).some((r) => r.id === id) && dirty[id] === sent[id]) delete dirty[id];
      return { [table]: map, dirty: { ...s.dirty, [table]: dirty } };
    });
  }
}

async function pull(table) {
  for (let guard = 0; guard < 50; guard++) {
    const since = useData.getState().rev[table] || 0;
    const res = await api(`/api/${table}/sync?since=${since}`);
    const rows = res[table] || [];
    useData.setState((s) => {
      const map = { ...s[table] };
      const dirty = { ...s.dirty[table] };
      for (const row of rows) {
        const local = map[row.id];
        if (local && dirty[row.id] && local.updated_at > row.updated_at) continue;
        map[row.id] = strip(row);
        delete dirty[row.id];
      }
      return { [table]: map, dirty: { ...s.dirty, [table]: dirty }, rev: { ...s.rev, [table]: Math.max(since, res.rev || 0) } };
    });
    if (!res.more) break;
  }
}

export async function syncNow() {
  const { key } = useData.getState().auth;
  if (!key) return;
  if (!navigator.onLine) { useSync.setState({ status: 'offline', online: false }); return; }
  if (running) { again = true; return; }
  running = true;
  useSync.setState({ status: 'syncing' });
  try {
    await push('tasks');
    await push('items');
    await pull('tasks');
    await pull('items');
    useSync.setState({ status: 'ok', error: null, last: Date.now(), online: true });
  } catch (e) {
    useSync.setState({ status: 'error', error: e.message });
    if (e.status === 401) useSync.setState({ error: 'Ключ не подходит — вставь новый в настройках' });
  } finally {
    running = false;
    if (again) { again = false; schedulePush(300); }
  }
}

export function schedulePush(ms = 1000) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, ms);
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  useData.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty && s.auth.key && (Object.keys(s.dirty.tasks).length || Object.keys(s.dirty.items).length)) schedulePush();
    if (s.auth.key && s.auth.key !== prev.auth.key) schedulePush(50);
  });
  window.addEventListener('focus', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => { useSync.setState({ online: true }); syncNow(); });
  window.addEventListener('offline', () => useSync.setState({ online: false, status: 'offline' }));
  setInterval(() => { if (document.visibilityState !== 'hidden') syncNow(); }, 30000);
  syncNow();
}
