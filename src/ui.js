// Состояние интерфейса: экраны (через hash), шторки, тосты, выбранная дата.
import { create } from 'zustand';
import { todayStr } from '../shared/dates.js';

const TABS = ['today', 'plans', 'growth', 'more'];
const DEFAULT_SUB = { plans: 'inbox', growth: 'habits', more: '' };

function parseHash() {
  const [tab, sub] = (location.hash || '').replace(/^#\/?/, '').split('/');
  const t = TABS.includes(tab) ? tab : 'today';
  return { tab: t, sub: sub || DEFAULT_SUB[t] || '' };
}

export const useUI = create((set, get) => ({
  ...parseHash(),
  date: todayStr(),
  sheet: null, // { type, props }
  toast: null,
  search: false,
  go(tab, sub) {
    const s = sub ?? (tab === get().tab ? get().sub : DEFAULT_SUB[tab] || '');
    const h = `#/${tab}${s ? '/' + s : ''}`;
    if (location.hash !== h) history.pushState(null, '', h);
    set({ tab, sub: s });
    window.scrollTo({ top: 0 });
  },
  setDate(date) { set({ date }); },
  open(type, props = {}) { set({ sheet: { type, props } }); },
  close() { set({ sheet: null }); },
  showToast(text, action, ms = 3500) {
    const id = Date.now();
    set({ toast: { id, text, action } });
    setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, ms);
  },
  setSearch(v) { set({ search: v }); },
}));

window.addEventListener('popstate', () => {
  const ui = useUI.getState();
  if (ui.sheet) { useUI.setState({ sheet: null }); }
  useUI.setState(parseHash());
});

export const toast = (...a) => useUI.getState().showToast(...a);
export const openSheet = (...a) => useUI.getState().open(...a);
