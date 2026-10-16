// PNG-иконки PWA из public/icon.svg
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('ok');
