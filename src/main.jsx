import { createRoot } from 'react-dom/client';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/screens.css';
import App from './App.jsx';
import { useData } from './store.js';
import { startSync, api } from './sync.js';
import { loadTelegram, setupTelegram } from './telegram.js';

async function boot() {
  // будит сервер: при первом запуске он сам подключит вебхук бота
  fetch('/api/health').catch(() => {});
  const wa = await loadTelegram();
  if (wa && wa.initData) {
    setupTelegram(wa);
    try {
      const me = await api('/api/auth/telegram', { method: 'POST', body: { initData: wa.initData }, key: '' });
      useData.getState().setAuth({ key: me.key, user: me.user });
    } catch (e) {
      console.warn('telegram auth failed', e);
    }
  }
  startSync();
}

createRoot(document.getElementById('root')).render(<App />);
boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
