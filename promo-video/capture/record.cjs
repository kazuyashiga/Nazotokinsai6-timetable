/**
 * PR 動画の実機素材を収録する（?mock=1 のサンプル公演を iPhone 13 相当で操作）。
 *
 *   node promo-video/capture/record.cjs [clip ...]      ※ 先に `npx vite --port 5179` でアプリを起動しておく
 *
 * 出力: promo-video/public/footage/<clip>.mp4（1170x1992・30fps）と <clip>.json（尺・タップ位置と時刻）
 *
 * 収録の仕組み:
 *   ヘッドレスの画面配信（screencast）は端末ピクセル密度を反映せず 390px 幅になるため使わない。
 *   代わりに時間を止め、1 コマ（1/30 秒）ずつ進めては 3 倍解像度のスクリーンショットを撮る。
 *   - JS の時間（タイマー・rAF・Date）… page.clock で 1 コマずつ進める
 *   - CSS アニメーション … 全体の再生速度を 0 にし、getAnimations() の currentTime を 1 コマずつ進める
 * 架空の操作は入れない。実際のアプリを、実際のボタンで操作したものだけを素材にする。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, devices } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:5179/?mock=1';
const OUT = path.join(__dirname, '..', 'public', 'footage');
const RAW = path.join(__dirname, 'raw');
const FPS = 30;
const DT = 1000 / FPS;
fs.mkdirSync(OUT, { recursive: true });

const device = devices['iPhone 13']; // viewport 390x664・DPR 3

async function run(name, steps, { url = BASE } = {}) {
  const frameDir = path.join(RAW, name);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...device });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`[${name}] page error: ${e.message}`));
  await page.clock.install();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ここから時間を止めて、1 コマずつ撮る
  const fakeNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(fakeNow + 20);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });

  let frame = 0;
  const taps = [];
  const shoot = async () => {
    await page.screenshot({ path: path.join(frameDir, `${String(frame).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
    frame++;
  };
  const step = async () => {
    await page.clock.runFor(DT);
    await page.evaluate((dt) => {
      for (const a of document.getAnimations()) {
        if (a.playState === 'finished' || a.playState === 'idle') continue;
        a.currentTime = (a.currentTime ?? 0) + dt;
      }
    }, DT);
    await shoot();
  };
  /** 動画の時間を ms 進める（その間のコマを撮る） */
  const advance = async (ms) => { for (let i = 0; i < Math.round(ms / DT); i++) await step(); };
  /** ゆっくりスクロール（ページ側の rAF で補間し、こちらでコマを進める） */
  const scroll = async (selector, { left, top }, ms = 1200) => {
    const done = page.evaluate(({ selector, left, top, ms }) => new Promise((res) => {
      const el = selector ? document.querySelector(selector) : document.scrollingElement;
      const sx = el.scrollLeft, sy = el.scrollTop;
      const tx = left ?? sx, ty = top ?? sy;
      const t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        el.scrollLeft = sx + (tx - sx) * ease(p);
        el.scrollTop = sy + (ty - sy) * ease(p);
        p < 1 ? requestAnimationFrame(tick) : res();
      };
      requestAnimationFrame(tick);
    }), { selector, left, top, ms });
    await advance(ms + DT * 2);
    await done;
  };
  /** 実際の要素をタップする。位置と時刻を記録し、その後 pauseMs 分のコマを撮る */
  const tap = async (locator, pauseMs = 700) => {
    const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    taps.push({ t: frame / FPS, x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await el.click({ timeout: 5000 });
    await advance(pauseMs);
  };

  await shoot();
  await steps({ page, tap, advance, scroll });
  await ctx.close();
  await browser.close();

  const out = path.join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frameDir, '%05d.jpg'),
    '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', out]);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ frames: frame, seconds: frame / FPS, viewport: device.viewport, scale: device.deviceScaleFactor, taps }, null, 2));
  console.log(`${name}: ${frame} frames (${(frame / FPS).toFixed(2)}s), taps ${taps.length}`);
}

const CLIPS = {
  // 開いた瞬間：ポスターの列を横に流し、表を縦に送る
  browse: () => run('browse', async ({ advance, scroll }) => {
    await advance(500);
    await scroll('#timetable-scroller', { left: 420 }, 2200);
    await advance(300);
    await scroll('#timetable-scroller', { left: 0 }, 1500);
    await scroll(null, { top: 330 }, 1300);
    await advance(600);
  }),

  // 時間枠をタップして選ぶ → 重なる枠を選ぶと赤く警告
  select: () => run('select', async ({ tap, advance, scroll }) => {
    await scroll(null, { top: 330 }, 900);
    await tap('.show-card[data-show-id="s1"]', 800);
    await tap('.show-card[data-show-id="e3"]', 800);
    await tap('.show-card[data-show-id="l4"]', 900);
    await scroll('#timetable-scroller', { left: 0 }, 600);
    await tap('.show-card[data-show-id="e1"]', 1800);
    await advance(400);
  }),

  // 予定を開いて、スキマ時間に入る公演を探す → 候補を追加
  gap: () => run('gap', async ({ page, tap, advance }) => {
    for (const id of ['s1', 'e3', 'a3']) await tap(`.show-card[data-show-id="${id}"]`, 150);
    await advance(300);
    await tap('#selection-cta-text', 1200);
    await tap('#find-gaps-btn', 4200);
    const add = page.locator('#schedule-dialog button:has-text("追加")').first();
    if (await add.count()) await tap(add, 1500);
    else console.warn('gap: 追加ボタンが見つかりませんでした');
    await advance(600);
  }),

  // 絞り込み：タグを選ぶと表が絞られる
  filter: () => run('filter', async ({ page, tap, advance, scroll }) => {
    await tap('#tools-open-btn', 1100);
    const tag = page.locator('#filter-tags-wrap').getByText('初心者', { exact: false }).first();
    if (await tag.count()) await tap(tag, 800);
    else console.warn('filter: タグが見つかりませんでした');
    await tap('#filter-apply-btn', 1300);
    await scroll('#timetable-scroller', { left: 300 }, 1400);
    await advance(800);
  }),

  // ポスターをタップ → リング型の詳細
  detail: () => run('detail', async ({ page, tap, advance }) => {
    await advance(400);
    await tap(page.locator('.visual-tap-btn').nth(1), 2800);
    await advance(500);
  }),

  // My ハシゴテーブル（チケット）→ SNS でシェア
  ticket: () => run('ticket', async ({ tap, advance, scroll }) => {
    for (const id of ['s1', 'l2', 'e3', 'a3']) await tap(`.show-card[data-show-id="${id}"]`, 150);
    await advance(300);
    await tap('#selection-cta-text', 1100);
    await tap('#go-pass-btn', 2200);
    await scroll('#schedule-panel-pass', { top: 520 }, 1600);
    await advance(400);
    await scroll('#schedule-panel-pass', { top: 0 }, 900);
    await tap('#share-btn', 2600);
    await advance(400);
  }),

  // 会場マップ：予定一覧の「ルートを見る」→ 1 階の全体 →「拡大」で流れる線を寄りで →「2階へ」を押して 2 階へ
  route: () => run('route', async ({ tap, advance }) => {
    for (const id of ['s1', 'e3', 'a3']) await tap(`.show-card[data-show-id="${id}"]`, 150);
    await advance(500);
    await tap('#selection-cta-text', 1300);
    await tap('.move-strip-btn', 2300);
    await tap('.rv-fit', 1900);
    await tap('.rv-next', 2400);
    await advance(300);
  }),

  // 知り合いから届いた共有 URL を開いたところ
  shared: () => run('shared', async ({ advance, scroll }) => {
    await advance(900);
    await scroll(null, { top: 330 }, 1300);
    await advance(1200);
  }, { url: `${BASE}&plan=s1,l2,e3,a3` }),
};

(async () => {
  const want = process.argv.slice(2);
  for (const [name, fn] of Object.entries(CLIPS)) {
    if (want.length && !want.includes(name)) continue;
    await fn();
  }
})();
