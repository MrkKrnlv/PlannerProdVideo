// Локальная копия данных — главная. Правки мгновенные и работают офлайн, синк — в фоне.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, spawnNext, habitLogId } from '../shared/planning.js';
import { todayStr, slotOf } from '../shared/dates.js';
import { uid } from './lib.js';

const stamp = (prev) => Math.max(Date.now(), (prev?.updated_at || 0) + 1);

function markTask(s, t) {
  return {
    tasks: { ...s.tasks, [t.id]: t },
    dirty: { ...s.dirty, tasks: { ...s.dirty.tasks, [t.id]: t.updated_at } },
  };
}

function markTasks(s, list) {
  const tasks = { ...s.tasks };
  const d = { ...s.dirty.tasks };
  for (const t of list) { tasks[t.id] = t; d[t.id] = t.updated_at; }
  return { tasks, dirty: { ...s.dirty, tasks: d } };
}

function markItems(s, list) {
  const items = { ...s.items };
  const d = { ...s.dirty.items };
  for (const i of list) { items[i.id] = i; d[i.id] = i.updated_at; }
  return { items, dirty: { ...s.dirty, items: d } };
}

export function newTask(p = {}) {
  const now = Date.now();
  return {
    id: uid('t'), title: '', date: null, time: null, slot: 'anytime', duration_min: null, area: null,
    priority: 2, note: '', deep: false, frog: false, repeat: null, checklist: [], done: false, deleted: false,
    source: 'app', created_at: now, updated_at: now,
    ...p,
    ...(p.time ? { slot: slotOf(p.time) } : {}),
  };
}

const initial = {
  tasks: {},
  items: {},
  dirty: { tasks: {}, items: {} },
  rev: { tasks: 0, items: 0 },
  auth: { key: null, user: null },
  local: { onboarded: false },
};

export const useData = create(persist((set, get) => ({
  ...initial,

  // ——— Задачи ———
  addTask(p) {
    const t = newTask(p);
    set((s) => {
      let list = [t];
      if (t.frog && t.date) list = list.concat(unfrogOthers(s, t));
      return markTasks(s, list);
    });
    return t.id;
  },
  updateTask(id, patch) {
    set((s) => {
      const prev = s.tasks[id];
      if (!prev) return {};
      const t = { ...prev, ...patch, updated_at: stamp(prev) };
      if ('time' in patch) t.slot = patch.time ? slotOf(patch.time) : (patch.slot || (prev.time ? 'anytime' : prev.slot));
      let list = [t];
      if (patch.frog && t.date) list = list.concat(unfrogOthers(s, t));
      return markTasks(s, list);
    });
  },
  updateTasks(ids, patchFn) {
    set((s) => markTasks(s, ids.filter((id) => s.tasks[id]).map((id) => {
      const prev = s.tasks[id];
      const patch = typeof patchFn === 'function' ? patchFn(prev) : patchFn;
      return { ...prev, ...patch, updated_at: stamp(prev) };
    })));
  },
  toggleTask(id, done) {
    set((s) => {
      const prev = s.tasks[id];
      if (!prev) return {};
      const today = todayStr();
      const nowDone = done ?? !prev.done;
      const t = { ...prev, done: nowDone, updated_at: stamp(prev) };
      // Хвост, сделанный сегодня, засчитывается сегодняшним днём
      if (nowDone && prev.date && prev.date < today) t.date = today;
      const list = [t];
      if (nowDone && prev.repeat && !prev.repeat.spawned) {
        const nextId = uid('t');
        const next = spawnNext(t, nextId, Date.now(), today);
        if (next) {
          t.repeat = { ...prev.repeat, spawned: nextId };
          list.push(next);
        }
      }
      return markTasks(s, list);
    });
  },
  deleteTask(id) {
    set((s) => {
      const prev = s.tasks[id];
      if (!prev) return {};
      return markTask(s, { ...prev, deleted: true, updated_at: stamp(prev) });
    });
  },
  restoreTask(t) {
    set((s) => markTask(s, { ...t, deleted: false, updated_at: stamp(s.tasks[t.id] || t) }));
  },

  // ——— Items: привычки, сферы, заметки, дни, 12 недель, настройки ———
  putItem(kind, id, data, { replace = false } = {}) {
    id = id || uid(kind[0]);
    set((s) => {
      const prev = s.items[id];
      const it = { id, kind, data: replace || !prev ? data : { ...prev.data, ...data }, deleted: false, updated_at: stamp(prev) };
      return markItems(s, [it]);
    });
    return id;
  },
  deleteItem(id) {
    set((s) => {
      const prev = s.items[id];
      if (!prev) return {};
      return markItems(s, [{ ...prev, deleted: true, updated_at: stamp(prev) }]);
    });
  },
  toggleHabit(habitId, date) {
    const id = habitLogId(habitId, date);
    set((s) => {
      const prev = s.items[id];
      const done = !(prev && !prev.deleted);
      return markItems(s, [{ id, kind: 'habit_log', data: { habit: habitId, date }, deleted: !done, updated_at: stamp(prev) }]);
    });
  },
  setSettings(patch) {
    get().putItem('settings', 'settings', patch);
  },
  setLocal(patch) {
    set((s) => ({ local: { ...s.local, ...patch } }));
  },
  setAuth(auth) {
    set((s) => {
      const changedUser = s.auth.user && auth.user && String(s.auth.user.id) !== String(auth.user.id);
      if (changedUser) return { ...initial, local: s.local, auth };
      const keyChanged = auth.key && auth.key !== s.auth.key;
      return { auth: { ...s.auth, ...auth }, ...(keyChanged ? { rev: { tasks: 0, items: 0 } } : {}) };
    });
  },
  logout() {
    set((s) => ({ auth: { key: null, user: null }, rev: { tasks: 0, items: 0 }, local: s.local }));
  },
  resetAll() {
    set({ ...initial, local: { onboarded: true } });
  },
  bulk(fn) {
    // fn(helpers) — массовые операции (импорт, демо)
    const tasks = [];
    const items = [];
    fn({
      task: (p) => { const t = newTask(p); tasks.push(t); return t.id; },
      item: (kind, data, id) => { const it = { id: id || uid(kind[0]), kind, data, deleted: false, updated_at: Date.now() }; items.push(it); return it.id; },
    });
    set((s) => ({ ...markTasks(s, tasks), ...markItems({ ...s, ...markTasks(s, tasks) }, items) }));
  },
}), {
  name: 'planner-v1',
  version: 1,
  partialize: (s) => ({ tasks: s.tasks, items: s.items, dirty: s.dirty, rev: s.rev, auth: s.auth, local: s.local }),
}));

function unfrogOthers(s, t) {
  return Object.values(s.tasks)
    .filter((x) => x.id !== t.id && x.frog && x.date === t.date && !x.deleted && !x.done)
    .map((x) => ({ ...x, frog: false, updated_at: stamp(x) }));
}

export function useSettings() {
  const it = useData((s) => s.items.settings);
  return it && !it.deleted ? { ...DEFAULT_SETTINGS, ...it.data } : DEFAULT_SETTINGS;
}

export const getSettings = () => {
  const it = useData.getState().items.settings;
  return it && !it.deleted ? { ...DEFAULT_SETTINGS, ...it.data } : DEFAULT_SETTINGS;
};
