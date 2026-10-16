import { useEffect } from 'react';
import Icon from './icons.jsx';
import { useData, useSettings } from './store.js';
import { useUI } from './ui.js';
import { cx, inbox } from './lib.js';
import Today from './screens/Today.jsx';
import Plans from './screens/Plans.jsx';
import Growth from './screens/Growth.jsx';
import More, { TimerWatcher, FocusPill } from './screens/More.jsx';
import { PlanDaySheet, CloseDaySheet } from './screens/DayFlows.jsx';
import { TaskSheet } from './components/tasks.jsx';
import { AddSheet, HabitSheet, NoteSheet, AreaSheet } from './components/sheets.jsx';
import { Search, Onboarding, Toast, useHotkeys } from './components/overlays.jsx';
import { tgApp, tgColors } from './telegram.js';
import { todayStr } from '../shared/dates.js';

const NAV = [
  { id: 'today', label: 'Сегодня', icon: 'today' },
  { id: 'plans', label: 'Планы', icon: 'plans' },
  { id: 'add', label: '', icon: 'plus' },
  { id: 'growth', label: 'Рост', icon: 'growth' },
  { id: 'more', label: 'Ещё', icon: 'more' },
];

const SHEETS = {
  task: TaskSheet, add: AddSheet, habit: HabitSheet, note: NoteSheet, area: AreaSheet,
  planDay: PlanDaySheet, closeDay: CloseDaySheet,
};

function useTheme() {
  const { theme } = useSettings();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const wa = tgApp();
      let dark;
      if (theme === 'dark') dark = true;
      else if (theme === 'light') dark = false;
      else if (wa) dark = wa.colorScheme === 'dark';
      else dark = mq.matches;
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0d0e17' : '#eef0f8');
      tgColors(dark);
    };
    apply();
    mq.addEventListener('change', apply);
    const wa = tgApp();
    wa?.onEvent?.('themeChanged', apply);
    return () => { mq.removeEventListener('change', apply); wa?.offEvent?.('themeChanged', apply); };
  }, [theme]);
}

export default function App() {
  const tab = useUI((s) => s.tab);
  const sheet = useUI((s) => s.sheet);
  const search = useUI((s) => s.search);
  const { go, open, setDate } = useUI.getState();
  const onboarded = useData((s) => s.local.onboarded);
  const inboxN = useData((s) => inbox(s.tasks).filter((t) => !t.done).length);
  useTheme();
  useHotkeys();
  // смена суток, пока приложение открыто
  useEffect(() => {
    let last = todayStr();
    const t = setInterval(() => {
      const now = todayStr();
      if (now !== last) { if (useUI.getState().date === last) setDate(now); last = now; }
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const SheetC = sheet ? SHEETS[sheet.type] : null;
  const navClick = (id) => {
    if (id === 'add') return open('add', {});
    if (id === 'today' && tab === 'today') setDate(todayStr());
    go(id, id === tab ? undefined : undefined);
  };

  return (
    <div className="app">
      <div className="bg" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /></div>
      <nav className="sidebar glass">
        <div className="brand"><span className="brand-mark"><Icon name="check" size={16} stroke={2.6} /></span>Планер</div>
        {NAV.filter((n) => n.id !== 'add').map((n) => (
          <button key={n.id} className={cx('side-item', tab === n.id && 'on')} onClick={() => navClick(n.id)}>
            <Icon name={n.icon} size={20} /><span>{n.label}</span>
            {n.id === 'plans' && inboxN ? <span className="badge">{inboxN}</span> : null}
          </button>
        ))}
        <button className="btn primary side-add" onClick={() => open('add', {})}><Icon name="plus" size={18} />Добавить</button>
        <button className="side-search" onClick={() => useUI.getState().setSearch(true)}><Icon name="search" size={16} /><span>Поиск</span><kbd>Ctrl K</kbd></button>
      </nav>
      <main className="main">
        {tab === 'today' ? <Today /> : tab === 'plans' ? <Plans /> : tab === 'growth' ? <Growth /> : <More />}
      </main>
      <FocusPill />
      <nav className="dock glass" aria-label="Навигация">
        {NAV.map((n) => n.id === 'add' ? (
          <button key="add" className="dock-add" onClick={() => open('add', {})} aria-label="Добавить"><Icon name="plus" size={26} stroke={2.2} /></button>
        ) : (
          <button key={n.id} className={cx('dock-item', tab === n.id && 'on')} onClick={() => navClick(n.id)}>
            <span className="dock-ic"><Icon name={n.icon} size={22} />{n.id === 'plans' && inboxN ? <span className="dot-badge" /> : null}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {SheetC ? <SheetC key={sheet.type + JSON.stringify(sheet.props)} {...sheet.props} /> : null}
      {search ? <Search /> : null}
      {!onboarded ? <Onboarding /> : null}
      <Toast />
      <TimerWatcher />
    </div>
  );
}
