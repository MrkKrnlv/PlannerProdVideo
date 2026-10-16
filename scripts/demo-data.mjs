// Демо-данные для скриншотов и ручной проверки
import { addDays, weekday, monthDays, weekStart } from '../shared/dates.js';
import { habitLogId } from '../shared/planning.js';

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

export function buildDemoState(today = '2026-10-16') {
  const r = rng(42);
  const now = Date.parse(today + 'T08:00:00');
  let n = 0;
  const tasks = {};
  const items = {};
  const T = (p) => {
    const id = 'demo-t' + (++n);
    tasks[id] = {
      id, title: '', date: null, time: null, slot: 'anytime', duration_min: null, area: null, priority: 2, note: '',
      deep: false, frog: false, repeat: null, checklist: [], done: false, deleted: false, source: 'app',
      created_at: now - 86400000 + n, updated_at: now + n, ...p,
    };
    if (p.time) tasks[id].slot = p.time < '12:00' ? 'morning' : p.time < '17:00' ? 'afternoon' : 'evening';
    return id;
  };
  const I = (kind, data, id) => {
    id = id || `demo-${kind}-${++n}`;
    items[id] = { id, kind, data, deleted: false, updated_at: now + n };
    return id;
  };

  // Сферы
  I('area', { name: 'работа', color: '#6366f1', goal: 25 });
  I('area', { name: 'блог', color: '#ec4899', goal: 8 });
  I('area', { name: 'здоровье', color: '#14b8a6', goal: 5 });
  I('area', { name: 'учёба', color: '#f59e0b', goal: 4 });
  I('area', { name: 'дом', color: '#8b5cf6', goal: 2 });

  // Сегодня
  T({ title: 'Разобрать почту и Telegram', date: today, time: '09:00', duration_min: 30, area: 'работа', done: true });
  T({ title: 'Сценарий ролика: AI-агент на n8n с памятью', date: today, time: '10:00', duration_min: 120, area: 'блог', frog: true, deep: true, priority: 1,
    checklist: [{ id: 'c1', text: 'Структура и хук', done: true }, { id: 'c2', text: 'Демо-воркфлоу', done: false }, { id: 'c3', text: 'Призыв в конце', done: false }] });
  T({ title: 'Синк с дизайнером', date: today, time: '12:30', duration_min: 15, area: 'работа' });
  T({ title: 'Созвон с клиентом по лендингу для стоматологии', date: today, time: '14:00', duration_min: 60, area: 'работа', priority: 1 });
  T({ title: 'Вёрстка блока тарифов на React', date: today, time: '16:00', duration_min: 90, area: 'работа', deep: true });
  T({ title: 'Тренировка: спина и плечи', date: today, time: '18:30', duration_min: 60, area: 'здоровье', repeat: { type: 'weekly', days: [1, 3, 5] } });
  T({ title: 'Выставить счёт студии за октябрь', date: today, duration_min: 10, area: 'работа', priority: 1 });
  T({ title: 'Ответить на комментарии на YouTube', date: today, duration_min: 20, area: 'блог', slot: 'afternoon' });
  T({ title: 'Купить корм коту', date: today, priority: 3, slot: 'evening', area: 'дом' });

  // Хвосты
  T({ title: 'Обновить портфолио: кейс с Директом', date: addDays(today, -2), duration_min: 45, area: 'работа' });
  T({ title: 'Прочитать статью про RAG и векторные базы', date: addDays(today, -10), duration_min: 30, area: 'учёба' });
  T({ title: 'Заполнить налоговую декларацию', date: addDays(today, -9), duration_min: 40, priority: 1 });

  // Входящие
  T({ title: 'Идея ролика: Make против n8n — что выбрать в 2026', area: 'блог' });
  T({ title: 'Посмотреть курс по Cloudflare Workers', duration_min: 90, area: 'учёба', priority: 3 });
  T({ title: 'Подарок маме на день рождения', priority: 1 });
  T({ title: 'Настроить бэкап self-hosted n8n', duration_min: 30, area: 'работа', source: 'voice' });

  // Прошлые дни месяца
  const titles = [
    ['Правки по лендингу', 'работа', 60], ['Настройка кампании в Яндекс Директ', 'работа', 90], ['Монтаж ролика', 'блог', 120],
    ['Пробежка 5 км', 'здоровье', 40], ['Урок английского', 'учёба', 45], ['Созвон с клиентом', 'работа', 30],
    ['Автоматизация заявок в n8n', 'работа', 120], ['Пост в Telegram-канал', 'блог', 20], ['Уборка', 'дом', 45], ['Разбор аналитики', 'работа', 30],
  ];
  for (const d of monthDays(today.slice(0, 7))) {
    if (d >= today) continue;
    const k = weekday(d) > 5 ? 1 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) {
      const [title, area, dur] = titles[Math.floor(r() * titles.length)];
      T({ title, area, duration_min: dur, date: d, time: `${String(9 + i * 2).padStart(2, '0')}:00`, done: r() < 0.97, frog: i === 0 && r() < 0.5, deep: dur >= 90 });
    }
  }
  // Сентябрь (для серий и рекордов)
  for (let i = 1; i <= 20; i++) {
    const d = addDays('2026-10-01', -i);
    T({ title: 'Работа над проектом', area: 'работа', duration_min: 90, date: d, done: true });
  }
  // Будущее
  T({ title: 'Запись ролика', date: addDays(today, 1), time: '11:00', duration_min: 120, area: 'блог', frog: true, deep: true });
  T({ title: 'Прогулка в парке', date: addDays(today, 1), time: '16:00', duration_min: 90, area: 'здоровье' });
  T({ title: 'Планирование недели', date: addDays(today, 2), time: '19:00', duration_min: 30, repeat: { type: 'weekly', days: [7] } });
  T({ title: 'Созвон с новым клиентом (автосервис)', date: addDays(today, 3), time: '12:00', duration_min: 45, area: 'работа' });
  T({ title: 'Сдать первый этап лендинга', date: addDays(today, 4), time: '15:00', duration_min: 60, area: 'работа', priority: 1 });
  T({ title: 'Стрим: собираем Telegram-бота', date: addDays(today, 5), time: '19:00', duration_min: 120, area: 'блог', deep: true });
  T({ title: 'Английский разговорный клуб', date: addDays(today, 6), time: '18:00', duration_min: 60, area: 'учёба' });

  // Привычки
  const habits = [
    I('habit', { name: 'Зарядка 10 минут', days: [1, 2, 3, 4, 5, 6, 7], remind: '08:00', start: '2026-09-01', created: 1 }, 'demo-h1'),
    I('habit', { name: 'Английский 20 минут', days: [1, 2, 3, 4, 5], remind: '20:30', start: '2026-09-01', created: 2 }, 'demo-h2'),
    I('habit', { name: 'Чтение 15 страниц', days: [1, 2, 3, 4, 5, 6, 7], start: '2026-09-01', created: 3 }, 'demo-h3'),
    I('habit', { name: 'Без соцсетей до 12:00', days: [1, 2, 3, 4, 5], start: '2026-09-01', created: 4 }, 'demo-h4'),
  ];
  const rate = [0.9, 0.7, 0.6, 0.8];
  habits.forEach((h, k) => {
    for (let i = 1; i <= 40; i++) {
      const d = addDays(today, -i);
      if (k === 0 && i <= 6) { I('habit_log', { habit: h, date: d }, habitLogId(h, d)); continue; }
      if (r() < rate[k]) I('habit_log', { habit: h, date: d }, habitLogId(h, d));
    }
  });
  I('habit_log', { habit: 'demo-h1', date: today }, habitLogId('demo-h1', today));
  I('habit_log', { habit: 'demo-h4', date: today }, habitLogId('demo-h4', today));

  // Итоги дней
  for (let i = 1; i <= 12; i++) {
    const d = addDays(today, -i);
    I('day', { date: d, mood: 2 + Math.floor(r() * 4), energy: 2 + Math.floor(r() * 4), good: ['Сдал правки вовремя', 'Хорошая тренировка', 'Ролик набрал 3к просмотров', 'Закрыл сложную задачу'][i % 4], note: '', closed: true }, 'day:' + d);
  }
  I('day', { date: addDays(today, 1), light: true }, 'day:' + addDays(today, 1));

  // Заметки
  I('note', { title: 'Идеи для роликов', text: '— Агент-секретарь в Telegram на n8n\n— Парсинг заявок из Авито в CRM\n— Как я веду планер голосом', created: now - 5e8 });
  I('note', { title: 'Чек-лист запуска рекламы', text: 'Минус-слова, UTM-метки, цели в Метрике, корректировки ставок по устройствам, проверка посадочной на мобильном.', created: now - 3e8 });
  I('note', { title: 'Мысли после созвона', text: 'Клиенту важнее скорость, чем идеальный дизайн. Предложить шаблонный старт и итерации раз в неделю.', created: now - 1e8 });

  // 12 недель
  const start = weekStart(addDays(today, -35));
  const plan = I('plan', { title: 'Осень: курс и стабильный доход', start }, 'demo-plan');
  const g1 = I('goal', { plan, title: 'Запустить мини-курс по n8n', created: 1 }, 'demo-g1');
  const g2 = I('goal', { plan, title: 'Фриланс: 250 тыс. ₽ в месяц', created: 2 }, 'demo-g2');
  const tacs = [
    I('tactic', { goal: g1, title: 'Записать 2 урока', fromWeek: 1, created: 1 }, 'demo-tc1'),
    I('tactic', { goal: g1, title: 'Выпустить 1 ролик на YouTube', fromWeek: 1, created: 2 }, 'demo-tc2'),
    I('tactic', { goal: g2, title: '15 откликов на заказы', fromWeek: 1, created: 3 }, 'demo-tc3'),
    I('tactic', { goal: g2, title: 'Оформить 1 кейс в портфолио', fromWeek: 2, created: 4 }, 'demo-tc4'),
  ];
  const pattern = [[1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1], [0, 1, 1, 0], [1, 1, 1, 1], [1, 0, 0, 0]];
  pattern.forEach((row, w) => row.forEach((v, k) => { if (v && tacs[k]) I('tactic_log', { tactic: tacs[k], week: w + 1 }, `tl:${tacs[k]}:${w + 1}`); }));

  I('settings', { theme: 'auto' }, 'settings');

  return {
    state: {
      tasks, items,
      dirty: { tasks: {}, items: {} },
      rev: { tasks: 0, items: 0 },
      auth: { key: null, user: null },
      local: { onboarded: true },
    },
    version: 1,
  };
}
