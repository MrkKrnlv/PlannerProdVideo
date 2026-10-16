// Интеграция с Telegram Mini App: загрузка SDK, тема, кнопка «Назад», вход по initData.
export function inTelegramHint() {
  return /tgWebApp/.test(location.hash) || /tgWebApp/.test(location.search) || !!window.TelegramWebviewProxy || !!window.external?.notify && /Telegram/i.test(navigator.userAgent);
}

export function loadTelegram() {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  if (!inTelegramHint()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => resolve(window.Telegram?.WebApp || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(window.Telegram?.WebApp || null), 4000);
  });
}

export const tgApp = () => (window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null);

export function setupTelegram(wa) {
  try {
    wa.ready();
    wa.expand();
    if (wa.isVersionAtLeast?.('7.7')) wa.disableVerticalSwipes();
  } catch { /* старый клиент */ }
}

export function tgColors(dark) {
  const wa = tgApp();
  if (!wa) return;
  const bg = dark ? '#0d0e17' : '#eef0f8';
  try {
    wa.setHeaderColor?.(bg);
    wa.setBackgroundColor?.(bg);
    if (wa.isVersionAtLeast?.('7.10')) wa.setBottomBarColor?.(bg);
  } catch { /* */ }
}
