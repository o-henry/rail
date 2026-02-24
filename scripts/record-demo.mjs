import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.resolve('docs/.recordings');
fs.mkdirSync(outDir, { recursive: true });

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  recordVideo: {
    dir: outDir,
    size: { width: 1400, height: 900 },
  },
});

const page = await context.newPage();
await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const clickNav = async (label) => {
  const button = page.getByRole('button', { name: label });
  if (await button.count()) {
    await button.first().click();
    await page.waitForTimeout(900);
  }
};

await clickNav('피드');
await clickNav('설정');
await clickNav('웹 연결');
await clickNav('워크플로우');

const langBtn = page.locator('.nav-lang-button');
if (await langBtn.count()) {
  await langBtn.first().click();
  await page.waitForTimeout(700);
  await langBtn.first().click();
  await page.waitForTimeout(700);
}

await clickNav('피드');
const filterBtn = page.getByRole('button', { name: /필터|Filter|筛选|フィルター/ });
if (await filterBtn.count()) {
  await filterBtn.first().click();
  await page.waitForTimeout(1000);
  await filterBtn.first().click();
  await page.waitForTimeout(800);
}

await clickNav('워크플로우');
await page.waitForTimeout(1200);
const video = page.video();

if (!video) {
  await context.close();
  await browser.close();
  throw new Error('No recorded video object');
}

const recordedPathPromise = video.path();
await context.close();
await browser.close();

const recordedPath = await recordedPathPromise;
const finalPath = path.resolve('docs/rail-demo.webm');
fs.copyFileSync(recordedPath, finalPath);
console.log(`saved: ${finalPath}`);
