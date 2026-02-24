import { chromium } from 'playwright-core';

const URL = 'http://127.0.0.1:1420';
const locales = ['en', 'ja', 'zh'];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox','--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

const report = [];
for (const locale of locales) {
  await page.evaluate((loc) => {
    localStorage.setItem('rail_ui_locale', loc);
  }, locale);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(350);

  const tabs = page.locator('.left-nav button');
  const count = await tabs.count();
  const localeLeaks = [];

  for (let i = 0; i < count; i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
    const txt = await page.locator('body').innerText();
    const lines = txt.split('\n').map((x) => x.trim()).filter(Boolean);
    const bad = lines.filter((line) => /[가-힣]/.test(line));
    if (bad.length) {
      localeLeaks.push({ tabIndex: i, samples: bad.slice(0, 8) });
    }
  }
  report.push({ locale, leaks: localeLeaks });
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
