/**
 * 着せ替え用の静止画：スプレッドシートの「タイムテーブルメインカラー／アクセントカラー」だけを変えた
 * モックデータを読み込ませ、トップ画面を 3 倍解像度で撮る（設定項目は実在するものだけを使う）。
 *   node promo-video/capture/themes.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:5179/?mock=1';
const OUT = path.join(__dirname, '..', 'public', 'themes');
fs.mkdirSync(OUT, { recursive: true });
const mock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'mock_data.json'), 'utf8'));

const THEMES = [
  { id: 'violet', main: '#5b21b6', accent: '#facc15' },
  { id: 'forest', main: '#1f5135', accent: '#f59e0b' },
  { id: 'navy', main: '#1e3a8a', accent: '#f472b6' },
  { id: 'crimson', main: '#9f1239', accent: '#fde047' },
];

(async () => {
  const browser = await chromium.launch();
  for (const th of THEMES) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    const data = { ...mock, config: { ...mock.config, 'タイムテーブルメインカラー': th.main, 'タイムテーブルアクセントカラー': th.accent } };
    await page.route('**/mock_data.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.locator('.show-card[data-show-id="s1"]').click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${th.id}.png`) });
    await ctx.close();
    console.log(th.id);
  }
  await browser.close();
})();
