// Таймеры только локальные, не синхронизируются.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from './lib.js';

export const useTimers = create(persist((set, get) => ({
  list: [], // { id, kind: 'focus'|'side', name, taskId, total, left, endsAt, running, finished }
  start(p) {
    const id = p.id || uid('tm');
    const total = Math.round(p.minutes * 60);
    const t = { id, kind: p.kind || 'side', name: p.name || 'Таймер', taskId: p.taskId || null, total, left: total, endsAt: Date.now() + total * 1000, running: true, finished: false };
    set((s) => ({ list: (p.kind === 'focus' ? s.list.filter((x) => x.kind !== 'focus') : s.list).concat(t) }));
    return id;
  },
  pause(id) {
    set((s) => ({ list: s.list.map((t) => (t.id === id && t.running ? { ...t, running: false, left: Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)) } : t)) }));
  },
  resume(id) {
    set((s) => ({ list: s.list.map((t) => (t.id === id && !t.running ? { ...t, running: true, finished: false, endsAt: Date.now() + t.left * 1000 } : t)) }));
  },
  reset(id) {
    set((s) => ({ list: s.list.map((t) => (t.id === id ? { ...t, running: false, finished: false, left: t.total } : t)) }));
  },
  remove(id) { set((s) => ({ list: s.list.filter((t) => t.id !== id) })); },
  finish(id) { set((s) => ({ list: s.list.map((t) => (t.id === id ? { ...t, running: false, finished: true, left: 0 } : t)) })); },
}), { name: 'planner-timers' }));

export const timeLeft = (t, now = Date.now()) => (t.running ? Math.max(0, Math.round((t.endsAt - now) / 1000)) : t.left);

export const fmtClock = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
