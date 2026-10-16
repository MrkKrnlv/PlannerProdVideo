// Скриншоты всех экранов (390px и 1440px, светлая и тёмная тема) + автопроверка переполнений.
// npm run build && npm run screenshots
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { buildDemoState } from './demo-data.mjs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => { server.stdout.on('data', (d) => { if (String(d).includes('localhost')) res(); }); setTimeout(res, 6000); });

const SHOTS = [
  { name: 'today', hash: '#/today' },
  { name: 'today-plan', hash: '#/today', act: async (p) => { await p.getByRole('button', { name: 'Спланировать день' }).first().click(); } },
  { name: 'today-autoplan', hash: '#/today', act: async (p) => { await p.getByRole('button', { name: 'Спланировать день' }).first().click(); await p.getByRole('button', { name: /^Автоплан/ }).click(); } },
  { name: 'today-close', hash: '#/today', act: async (p) => { await p.getByRole('button', { name: /Завершить день/ }).click(); } },
  { name: 'today-close-2', hash: '#/today', act: async (p) => { await p.getByRole('button', { name: /Завершить день/ }).click(); await p.getByRole('button', { name: /Дальше/ }).click(); await p.locator('.rate').nth(3).click(); } },
  { name: 'task', hash: '#/today', act: async (p) => { await p.locator('.task-row', { hasText: 'Ответить на комментарии' }).first().click(); } },
  { name: 'task-pickers', hash: '#/today', act: async (p) => { await p.locator('.task-row', { hasText: 'Ответить на комментарии' }).first().click(); await p.locator('.picker-btn', { hasText: 'Время' }).click(); } },
  { name: 'add', hash: '#/today', act: async (p) => { await p.locator('.dock-add:visible, .side-add:visible').first().click(); await p.locator('.sheet .quick-input').fill('созвон 1.5ч в 16:00 завтра #работа !'); } },
  { name: 'plans-inbox', hash: '#/plans/inbox' },
  { name: 'plans-week', hash: '#/plans/week' },
  { name: 'plans-month', hash: '#/plans/month' },
  { name: 'growth-habits', hash: '#/growth/habits' },
  { name: 'growth-areas', hash: '#/growth/areas' },
  { name: 'growth-cycle', hash: '#/growth/cycle' },
  { name: 'more', hash: '#/more' },
  { name: 'more-timers', hash: '#/more/timers', act: async (p) => { await p.getByRole('button', { name: '25 мин' }).click(); } },
  { name: 'more-notes', hash: '#/more/notes' },
  { name: 'more-export', hash: '#/more/export' },
  { name: 'more-import', hash: '#/more/import' },
  { name: 'more-settings', hash: '#/more/settings' },
  { name: 'search', hash: '#/today', act: async (p) => { await p.keyboard.press('Control+k'); await p.keyboard.type('ролик'); } },
  { name: 'onboarding', hash: '#/today', noFull: true, state: (s) => { s.state.local.onboarded = false; } },
  { name: 'empty', hash: '#/today', state: (s) => { s.state.tasks = {}; s.state.items = {}; } },
];

const VIEWPORTS = [{ w: 390, h: 844, tag: 'm' }, { w: 1440, h: 900, tag: 'd' }];
const THEMES = ['light', 'dark'];

async function checkLayout(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const issues = [];
    if (document.documentElement.scrollWidth > vw + 1) issues.push(`горизонтальный скролл: ${document.documentElement.scrollWidth} > ${vw}`);
    const label = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} «${(el.textContent || '').trim().slice(0, 40)}»`;
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.bg') || el.closest('svg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > vw + 1 || r.left < -1) issues.push(`за краем экрана (${Math.round(r.left)}..${Math.round(r.right)}): ${label(el)}`);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && !['INPUT', 'TEXTAREA'].includes(el.tagName)) issues.push(`обрезан текст: ${label(el)}`);
    }
    return [...new Set(issues)].slice(0, 30);
  });
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {};
for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.w < 500 ? 2 : 1, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: vp.w < 500 });
    for (const shot of SHOTS) {
      if (only && !only.test(shot.name)) continue;
      const page = await ctx.newPage();
      await page.clock.setFixedTime(new Date('2026-10-16T11:20:00+03:00'));
      const st = buildDemoState('2026-10-16');
      st.state.items.settings = { id: 'settings', kind: 'settings', data: { theme }, deleted: false, updated_at: 1 };
      if (shot.state) shot.state(st);
      await page.addInitScript((s) => { localStorage.setItem('planner-v1', s); localStorage.removeItem('planner-timers'); }, JSON.stringify(st));
      await page.goto(BASE + '/' + shot.hash);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      if (shot.act) await shot.act(page);
      await page.waitForTimeout(450);
      const file = `${shot.name}-${vp.tag}-${theme}.png`;
      const full = vp.w < 500 && !shot.act && !shot.noFull;
      // на длинном скриншоте фиксированный док прижимаем к низу страницы
      if (full) await page.addStyleTag({ content: 'html{position:relative} .dock,.focus-pill{position:absolute!important}' });
      await page.screenshot({ path: OUT + file, fullPage: full });
      const issues = await checkLayout(page);
      if (issues.length) report[file] = issues;
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
server.kill();
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
const n = Object.keys(report).length;
console.log(n ? `Проблемы вёрстки в ${n} скриншотах:\n` + JSON.stringify(report, null, 2) : 'Проблем вёрстки не найдено');
