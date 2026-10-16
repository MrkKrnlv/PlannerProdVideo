# Планер

Личный планер дня: PWA + Telegram Mini App + голосовой Telegram-бот. Всё живёт в **одном Cloudflare Worker** на бесплатном тарифе: статика, API, синхронизация через D1, бот, Workers AI (Whisper + Llama 3.3), cron для Notion и напоминаний о привычках.

- Фронт: React 19 + Vite, Zustand (persist в localStorage), чистый CSS, шрифт Golos Text (self-hosted через fontsource).
- Бэкенд: `server/worker.js`, база Cloudflare D1 (схема создаётся кодом при первом запросе).
- Синк: локальная копия главная, правки мгновенно и офлайн; push через ~1 с, pull по серверной ревизии.

---

## ⚠️ ГЛАВНОЕ: вставь ID своей базы D1

В `wrangler.toml` есть строка:

```toml
database_id = "REPLACE_WITH_D1_ID"
```

**Замени `REPLACE_WITH_D1_ID` на ID своей базы D1** (Cloudflare → Storage & Databases → D1 → твоя база → поле *Database ID*). Без этого деплой не пройдёт. SQL руками запускать не нужно — таблицы создаются автоматически.

---

## Локальный запуск

```bash
npm install
npm test               # тесты логики, API, бота и Notion (node:sqlite)
npm run dev:worker     # сборка + wrangler dev с wrangler.local.toml → http://localhost:8787
```

`wrangler.local.toml` — копия конфига без биндинга Workers AI (локально он требует токен Cloudflare) и с `DEV_MODE=1`. В «Ещё → Настройки» появится кнопка **«Демо-вход (локально)»** — включает синхронизацию с локальной D1. Голосовой бот локально отвечает через запасной разбор без ИИ.

Фронт с hot reload: в одном терминале `npm run dev:worker`, во втором `npm run dev` (Vite на :5173 проксирует `/api` на :8787).

Скриншоты всех экранов (390 и 1440 px, светлая и тёмная тема) с автопроверкой переполнений:

```bash
npm run build && npm run screenshots   # → screenshots/*.png, screenshots/report.json
```

## Деплой через дашборд Cloudflare

1. **D1.** Cloudflare → Storage & Databases → D1 → *Create database* → имя `planner`. Скопируй *Database ID* и вставь в `wrangler.toml` вместо `REPLACE_WITH_D1_ID`, закоммить.
2. **Worker из GitHub.** Workers & Pages → *Create* → *Import a repository* → выбери этот репозиторий.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Остальное оставь по умолчанию. Биндинги (D1 `DB`, Workers AI `AI`, assets, cron) берутся из `wrangler.toml`.
3. **Секреты.** Worker → Settings → Variables and Secrets → *Add* → тип **Secret**:
   - `BOT_TOKEN` — токен бота от @BotFather;
   - `SERVICE_KEY` — длинная случайная строка (для n8n/Make и других автоматизаций).
   
   Необязательно (тип Text): `ALLOWED_USERS` — Telegram ID через запятую, кому разрешён вход (если планер только для тебя — впиши свой ID); `PUBLIC_URL` — если используешь свой домен.
4. Сделай *Retry deployment* (или новый коммит), чтобы секреты подхватились. Адрес будет вида `https://planner.<аккаунт>.workers.dev`.

## Настройка бота (BotFather)

1. @BotFather → `/newbot` → получи токен → положи в секрет `BOT_TOKEN`.
2. @BotFather → `/mybots` → бот → *Bot Settings* → *Configure Mini App* → *Enable Mini App* → URL: адрес воркера (`https://planner.<аккаунт>.workers.dev`).
3. Открой бота → кнопка меню/ссылка на Mini App → «Ещё → Настройки» → **«Настроить бота»**. Это вызовет `setWebhook` (с секретом, выведенным из токена), `setChatMenuButton` (кнопка «Планер») и `setMyCommands`.
4. Отправь боту голосовое: «завтра в четыре созвон на полтора часа и в пятницу сдать отчёт» — задачи появятся в планере.

Если Mini App ещё не открывается — открой адрес воркера в браузере, затем после первого входа через Telegram скопируй ключ.

## Открыть на компьютере / как PWA

В Mini App: «Ещё → Настройки → Ключ для браузера» → *Копировать*. Открой адрес воркера в браузере → вставь ключ в онбординге или в настройках. Данные синхронизируются в обе стороны. Установить как приложение: меню браузера → «Установить приложение» / «На экран Домой».

## Notion (синк в одну сторону)

1. https://www.notion.so/profile/integrations → *New integration* (Internal) → скопируй *Internal Integration Secret*.
2. Создай пустую страницу в Notion → `•••` → *Connections* → добавь свою интеграцию.
3. В планере: «Ещё → Настройки → Notion» → вставь секрет и ссылку на страницу → **«Подключить Notion»**. В странице появится база «Планер» (Задача, Когда, Готово, Сфера, Минут, Главное).
4. Cron каждые 5 минут досылает изменённые задачи с датой (курсор по серверной ревизии, не больше 35 запросов к Notion за запуск), удалённые и снятые с даты — архивирует.

## API для автоматизаций (n8n, Make)

Заголовки: `X-Service-Key: <SERVICE_KEY>` и `X-Telegram-User-Id: <твой Telegram ID>` (или `Authorization: Bearer <ключ из настроек>`).

```bash
# добавить задачу текстом (тот же парсер, что в быстром вводе)
curl -X POST https://<воркер>/api/tasks -H 'content-type: application/json' \
  -H 'X-Service-Key: …' -H 'X-Telegram-User-Id: 123' \
  -d '{"text": "созвон 1.5ч в 16:00 завтра #работа !"}'

# через ИИ (как голосовое в боте): {"ai": true, "text": "…"}
# структурно: {"title": "Отчёт", "date": "2026-10-20", "time": "11:00", "duration_min": 60}
# задачи на дату: GET /api/tasks?date=2026-10-16
```

## Структура

```
server/   worker.js (роутер, cron), db.js (схема, LWW-синк, ревизии), auth.js (initData, ключи),
          telegram.js (бот, напоминания), ai.js (Whisper, Llama JSON-режим), notion.js
shared/   dates.js, parse.js (быстрый ввод), planning.js (шкалы, автоплан, очки, повторы), transfer.js (экспорт/импорт)
src/      React-приложение: screens/, components/, store.js, sync.js, styles/
tests/    node:test + node:sqlite (D1-обёртка), подмена Telegram/Workers AI/Notion
scripts/  demo-data.mjs, screenshots.mjs, icons.mjs
```

## Как устроен синк

- Каждая правка ставит `updated_at` и помечает запись «грязной». Через ~1 с грязные записи уходят `POST /api/tasks/sync` и `/api/items/sync`. Сервер принимает запись, только если её `updated_at` новее (last-write-wins по записи), и присваивает ей серверную ревизию `rev` в той же транзакции.
- Pull: `GET …/sync?since=<rev>` — по серверной ревизии, а не по часам клиента. При фокусе окна, возврате в сеть и раз в 30 с.
- Удаление = надгробие (`deleted=1`), поэтому удалённое не воскресает. Отметки привычек имеют детерминированные id `hl:<привычка>:<дата>`.
- Таймеры только локальные.
