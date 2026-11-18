const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Syaka\\.gemini\\antigravity\\brain\\b2c05786-1dc1-4d46-8a5b-bc6793e77748';
const DOWNLOAD_DIR = path.join(ARTIFACT_DIR, 'scratch', 'e2e_downloads');
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) {
      // 起動待ち
    }
    await sleep(200);
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

async function run() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  for (const f of fs.readdirSync(DOWNLOAD_DIR)) {
    fs.unlinkSync(path.join(DOWNLOAD_DIR, f));
  }

  const serverProc = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    await waitForServer(BASE_URL);

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = browser.defaultBrowserContext();
    await context.overridePermissions(BASE_URL, ['clipboard-read', 'clipboard-write']);

    const browserCdp = await browser.target().createCDPSession();
    await browserCdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR
    });

    const page = await browser.newPage();
    await page.bringToFront();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

    const cdp = await page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(String(err));
    });
    page.on('requestfailed', req => {
      // Google Fonts などオフライン時に遮断された外部フォントはアプリ不具合と分離
      if (req.url().startsWith(BASE_URL)) {
        failedRequests.push(`${req.url()} (${req.failure()?.errorText || 'failed'})`);
      }
    });
    page.on('response', res => {
      if (res.url().startsWith(BASE_URL) && res.status() >= 400) {
        failedRequests.push(`${res.url()} HTTP ${res.status()}`);
      }
    });

    // 1. 初期画面ロード
    await page.goto(`${BASE_URL}?mock=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#card-s1');

    const initialChecks = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const nav = document.querySelector('.sticky-controls');
      const navHeight = nav ? nav.getBoundingClientRect().height : 999;
      const bar = document.getElementById('selection-bar');
      const firstCard = document.getElementById('card-s1');
      const cardRect = firstCard ? firstCard.getBoundingClientRect() : null;
      const c1 = document.getElementById('card-c1');
      const c2 = document.getElementById('card-c2');
      const c1Rect = c1 ? c1.getBoundingClientRect() : null;
      const c2Rect = c2 ? c2.getBoundingClientRect() : null;
      const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const leftBorderColor = firstCard ? getComputedStyle(firstCard).borderLeftColor : '';
      const topBorderColor = firstCard ? getComputedStyle(firstCard).borderTopColor : '';
      const cardStyle = firstCard ? getComputedStyle(firstCard) : null;
      const cardBeforeContent = firstCard ? getComputedStyle(firstCard, '::before').content : '';
      const specBtn = document.querySelector('.spec-pill-btn[data-spec-show-id="s1"]');
      const specFeeText = specBtn?.querySelector('.spec-pill-fee')?.textContent?.trim() || '';
      const visualBox = document.querySelector('.venue-col .visual-placeholder, .venue-col .program-visual');
      const visualRect = visualBox ? visualBox.getBoundingClientRect() : null;
      const colHeader = document.querySelector('.col-header');
      const firstTimeSlot = document.querySelector('#time-axis-col .time-slot-label');
      const headerBottom = colHeader ? colHeader.getBoundingClientRect().bottom : 0;
      const firstSlotTop = firstTimeSlot ? firstTimeSlot.getBoundingClientRect().top : 0;

      return {
        navHeight,
        barHidden: bar ? bar.classList.contains('is-hidden') : false,
        hasPlanAB: bodyText.includes('プランA') || bodyText.includes('プランB'),
        hasZoomToggle: bodyText.includes('全体俯瞰サイズ'),
        cardText: firstCard ? firstCard.innerText.trim() : '',
        cardHeight: cardRect ? cardRect.height : 0,
        cardTextAlign: cardStyle ? cardStyle.textAlign : '',
        cardJustifyContent: cardStyle ? cardStyle.justifyContent : '',
        specFeeText,
        visualRatioPortrait: Boolean(visualRect && visualRect.height > visualRect.width * 1.3),
        axisAligned: Math.abs(headerBottom - firstSlotTop) <= 1.5,
        c1Text: c1 ? c1.innerText.trim() : '',
        c2Text: c2 ? c2.innerText.trim() : '',
        c2BelowC1: Boolean(c1Rect && c2Rect && c2Rect.top > c1Rect.bottom + 10),
        docOverflow,
        borderUniform: leftBorderColor === topBorderColor,
        cardBeforeContent,
        cardBgImage: cardStyle ? cardStyle.backgroundImage : '',
        cardRadius: cardStyle ? cardStyle.borderRadius : '',
        openBtnRadius: getComputedStyle(document.getElementById('open-schedule-btn')).borderRadius,
        openBtnShadow: getComputedStyle(document.getElementById('open-schedule-btn')).boxShadow,
        howtoVisible: Boolean(document.getElementById('howto-open-btn')?.offsetParent),
        stepperVisible: Boolean(document.getElementById('day-stepper')?.offsetParent),
        toolsVisible: Boolean(document.getElementById('tools-open-btn')?.offsetParent)
      };
    });

    assert.strictEqual(initialChecks.barHidden, true, '初期状態では下部選択バーが非表示であること');
    assert.strictEqual(initialChecks.hasPlanAB, false, 'Plan A/B 表記が存在しないこと');
    assert.strictEqual(initialChecks.hasZoomToggle, false, '全体俯瞰サイズ表記が存在しないこと');
    assert.ok(initialChecks.navHeight <= 844 * 0.12, `スティッキーナビ高さ ${initialChecks.navHeight}px <= 101px`);
    assert.strictEqual(initialChecks.cardText.includes('メインホール'), false, 'カード内に場所名が出ないこと');
    assert.strictEqual(initialChecks.cardText.includes('10:30-11:30'), true, 'カード内に時刻が出ること');
    assert.strictEqual(initialChecks.cardTextAlign, 'center', '時間枠カード内のテキストが中央揃えであること');
    assert.strictEqual(initialChecks.cardJustifyContent, 'center', '時間枠カード内が上下中央配置であること');
    assert.strictEqual(initialChecks.specFeeText, '2,500円', 'トップページ列ヘッダーに参加料が表示されること');
    assert.strictEqual(initialChecks.visualRatioPortrait, true, 'トップページ公演ビジュアル枠が縦長比率であること');
    assert.strictEqual(initialChecks.axisAligned, true, '時間軸と列ヘッダー境界の位置が一致していること');
    assert.strictEqual(initialChecks.c1Text.includes('10:00-12:00'), true, '午前随時受付枠(10:00-12:00)が表示されること');
    assert.strictEqual(initialChecks.c2Text.includes('13:00-18:00'), true, '午後随時受付枠(13:00-18:00)が表示されること');
    assert.strictEqual(initialChecks.c2BelowC1, true, '12:00-13:00休止の空白を挟んで2枠目が下に描画されること');
    assert.strictEqual(initialChecks.docOverflow, false, '横スクロールオーバーフローが無いこと');
    assert.strictEqual(initialChecks.borderUniform, true, 'カードのボーダーが左だけ別色でないこと');
    assert.strictEqual(initialChecks.cardBeforeContent, 'none', '時間枠カードに疑似要素の一辺ラインが存在しないこと');
    assert.strictEqual(initialChecks.cardBgImage, 'none', '時間枠カードに縦グラデーションがかかっていないこと');
    assert.strictEqual(initialChecks.cardRadius, '3px', '時間枠カードの角丸が控えめな3pxであること');
    assert.strictEqual(initialChecks.openBtnRadius, '3px', '下部選択バーボタンの角丸も3pxに統一されていること');
    assert.notStrictEqual(initialChecks.openBtnShadow, 'none', '下部選択バーボタンにもキーキャップ下影が付いていること');
    assert.ok(initialChecks.howtoVisible && initialChecks.stepperVisible && initialChecks.toolsVisible, '上部3ボタンが表示されていること');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_1_initial.png') });

    // 詳細ポップオーバー確認 ＋ 3Dチルトビジュアル確認
    await page.click('.spec-pill-btn[data-spec-show-id="s1"]');
    // ポスターが中央へ飛び、5つの情報が回りながら開く動きの完了を待つ（開き切るまで傾きは付かない）
    await page.waitForFunction(() => {
      const pop = document.getElementById('spec-popover');
      return pop && pop.matches(':popover-open')
        && pop.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
    }, { timeout: 3000 });
    await sleep(60);
    const tiltStageBox = await page.evaluate(() => {
      const card = document.getElementById('pop-visual-card');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    assert.ok(tiltStageBox && tiltStageBox.width > 100 && tiltStageBox.height > tiltStageBox.width * 1.3, '詳細ポップオーバー3Dチルトビジュアル枠が縦長比率で描画されること');

    await page.mouse.move(tiltStageBox.left + tiltStageBox.width * 0.85, tiltStageBox.top + tiltStageBox.height * 0.2);
    await sleep(120);

    const popState = await page.evaluate(() => {
      const pop = document.getElementById('spec-popover');
      const card = document.getElementById('pop-visual-card');
      return {
        open: pop ? pop.matches(':popover-open') : false,
        room: document.getElementById('pop-room')?.textContent,
        diff: document.getElementById('pop-diff')?.textContent,
        fee: document.getElementById('pop-fee')?.textContent,
        tiltRx: card?.style.getPropertyValue('--tilt-rx') || '',
        tiltRy: card?.style.getPropertyValue('--tilt-ry') || '',
        glareOpacity: card?.style.getPropertyValue('--glare-opacity') || ''
      };
    });
    assert.strictEqual(popState.open, true, '詳細ポップオーバーが開くこと');
    assert.strictEqual(popState.room, 'メインホール', '詳細ポップオーバーに開催場所が表示されること');
    // 縦書きの欄に置くため、数字のカンマは外して表示する
    assert.strictEqual(popState.fee, '2500円', '参加料が表示されること');
    assert.ok(popState.tiltRx && popState.tiltRx !== '0deg', `3Dチルト --tilt-rx が更新されること (got: ${popState.tiltRx})`);
    assert.ok(popState.tiltRy && popState.tiltRy !== '0deg', `3Dチルト --tilt-ry が更新されること (got: ${popState.tiltRy})`);
    assert.strictEqual(popState.glareOpacity, '0.9', 'グレア透明度 --glare-opacity が変化すること');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_1b_spec_tilt.png') });
    await page.click('#spec-popover-close-btn');
    // 逆再生で閉じ切るのを待つ
    await page.waitForFunction(() => !document.getElementById('spec-popover')?.matches(':popover-open'), { timeout: 3000 });
    await sleep(60);

    // 2. s1 (10:30-11:30) & s3 (14:30-15:30) をタップ -> 下部選択バーせり出し
    await page.click('#card-s1');
    await page.click('#card-s3');
    await sleep(320);

    const selectedState = await page.evaluate(() => {
      const bar = document.getElementById('selection-bar');
      const cta = document.getElementById('selection-cta-text')?.textContent || '';
      const c1Sel = document.getElementById('card-s1')?.classList.contains('is-selected');
      const c3Sel = document.getElementById('card-s3')?.classList.contains('is-selected');
      return {
        barHidden: bar?.classList.contains('is-hidden'),
        cta,
        c1Sel,
        c3Sel
      };
    });
    assert.strictEqual(selectedState.barHidden, false, '選択後に下部バーが表示されること');
    assert.ok(selectedState.cta.includes('2公演'), `CTAに2公演が含まれること (got: ${selectedState.cta})`);
    assert.ok(selectedState.c1Sel && selectedState.c3Sel, '選択カードに .is-selected が付くこと');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_2_selected_bar.png') });

    // 3. 「自分のハシゴテーブルを見る」を開いた直後（スキマ候補はまだ非展開）
    await page.click('#open-schedule-btn');
    await sleep(200);

    const scheduleInit = await page.evaluate(() => {
      const dlg = document.getElementById('schedule-dialog');
      const tlCards = document.querySelectorAll('#schedule-panel-timeline .tl-card').length;
      const gapBlocks = document.querySelectorAll('#schedule-panel-timeline .gap-block').length;
      const firstCardText = document.querySelector('#schedule-panel-timeline .tl-card')?.innerText || '';
      return {
        open: dlg?.open,
        heading: document.getElementById('schedule-heading-text')?.textContent,
        tlCards,
        gapBlocks,
        hasRoomInSchedule: firstCardText.includes('メインホール')
      };
    });
    assert.strictEqual(scheduleInit.open, true, '予定モーダルが開くこと');
    assert.strictEqual(scheduleInit.tlCards, 2, '予定カードが2枚出ること');
    assert.strictEqual(scheduleInit.gapBlocks, 0, '開いた直後はスキマ候補が未展開であること');
    assert.strictEqual(scheduleInit.hasRoomInSchedule, true, '予定モーダル内では開催場所が表示されること');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_3_schedule_initial.png') });

    // 4. スキマ探索ボタン押下 -> Now Loading 画面
    await page.click('#find-gaps-btn');
    await sleep(150);

    const loadingState1 = await page.evaluate(() => {
      const ov = document.getElementById('gap-loading-overlay');
      const ovText = ov?.innerText || '';
      const msg = document.getElementById('loading-quirky-msg')?.textContent || '';
      return {
        hidden: ov?.classList.contains('hidden'),
        ovText,
        msg,
        hasNowLoadingTitle: /NOW\s*LOADING/i.test(ovText),
        hasSubCaption: ovText.includes('今の予定のあいだに') || ovText.includes('今の間に滑り込める')
      };
    });
    assert.strictEqual(loadingState1.hidden, false, 'Now Loading オーバーレイが表示されること');
    assert.strictEqual(loadingState1.hasNowLoadingTitle, false, '不要文言 NOW LOADING が無いこと');
    assert.strictEqual(loadingState1.hasSubCaption, false, '不要サブ文言が無いこと');
    assert.ok(loadingState1.msg.length > 0, 'ナゾトキあるある待機メッセージが出ること');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_4_gap_loading.png') });

    // 700ms 経過後もまだ最低1秒演出中であること・メッセージ切替を確認
    await sleep(700);
    const loadingState2 = await page.evaluate(() => ({
      hidden: document.getElementById('gap-loading-overlay')?.classList.contains('hidden'),
      msg: document.getElementById('loading-quirky-msg')?.textContent || ''
    }));
    assert.strictEqual(loadingState2.hidden, false, '850ms時点ではまだ待機演出が継続中であること');
    assert.notStrictEqual(loadingState2.msg, loadingState1.msg, '待機メッセージが別の文言へ切り替わること');

    // 5. スキマ候補展開完了（前後5分バッファ検証）
    await page.waitForFunction(() => {
      const ov = document.getElementById('gap-loading-overlay');
      return ov && ov.classList.contains('hidden') && document.querySelectorAll('.gap-block').length > 0;
    }, { timeout: 3000 });
    await sleep(360);

    const gapResult = await page.evaluate(() => {
      const block = document.querySelector('.gap-block');
      const header = block?.querySelector('.gap-header')?.innerText || '';
      const candTitles = Array.from(document.querySelectorAll('.gap-cand-item .gap-cand-title')).map(el => el.textContent);
      const candMetas = Array.from(document.querySelectorAll('.gap-cand-item .gap-cand-meta')).map(el => el.textContent);
      return { header, candTitles, candMetas };
    });
    assert.ok(gapResult.header.includes('前後5分余裕あり'), `0分移動NG表示があること (${gapResult.header})`);
    assert.ok(gapResult.candMetas.some(m => m.includes('12:00-12:30')), '12:00-12:30 (前後5分OK) が提案されること');
    assert.strictEqual(gapResult.candMetas.some(m => m.includes('13:45-14:30')), false, '13:45-14:30 (14:30終了で0分移動NG違反) が除外されること');
    assert.ok(gapResult.candMetas.some(m => m.includes('13:00-18:00')), '休止明けの午後随時受付枠(13:00-18:00)がスキマ候補に提案されること');
    assert.strictEqual(gapResult.candMetas.some(m => m.includes('10:00-12:00')), false, '残り25分で所要30分を満たさない午前随時受付枠(10:00-12:00)は除外されること');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_5_gap_results.png') });

    // 「+ 追加」でスキマ候補 (e2: 12:00-12:30) を予定に追加
    await page.click('.gap-add-btn[data-add-show-id="e2"]');
    await sleep(150);
    const afterAddCount = await page.evaluate(() => document.querySelectorAll('#schedule-panel-timeline .tl-card').length);
    assert.strictEqual(afterAddCount, 3, '+ 追加 押下で予定カードが3件になること');

    // 6. My ハシゴテーブル画面へ遷移 & ボタン配置・コピー・PNG画像生成検証
    await page.click('#go-pass-btn');
    await sleep(320);

    const passChecks = await page.evaluate(() => {
      const heading = document.getElementById('schedule-heading-text')?.textContent || '';
      const passTitle = document.getElementById('modal-fes-title')?.textContent || '';
      const items = document.querySelectorAll('#pass-items-container .pass-item').length;
      const copyRect = document.getElementById('copy-plan-btn')?.getBoundingClientRect();
      const dlRect = document.getElementById('download-btn')?.getBoundingClientRect();
      const shareRect = document.getElementById('share-btn')?.getBoundingClientRect();
      const firstItem = document.querySelector('#pass-items-container .pass-item');
      const leftBorder = firstItem ? getComputedStyle(firstItem).borderLeftColor : '';
      const topBorder = firstItem ? getComputedStyle(firstItem).borderTopColor : '';
      return {
        heading,
        passTitle,
        items,
        copyLeftOfDl: Boolean(copyRect && dlRect && copyRect.left < dlRect.left && Math.abs(copyRect.top - dlRect.top) < 5),
        shareBelowAndWide: Boolean(shareRect && copyRect && shareRect.top > copyRect.bottom && shareRect.width > copyRect.width * 1.5),
        borderUniform: leftBorder === topBorder
      };
    });
    assert.ok(passChecks.heading.includes('My ハシゴテーブル'), '見出しが My ハシゴテーブルであること');
    assert.ok(passChecks.passTitle.includes('My ハシゴテーブル'), 'パス見出しも My ハシゴテーブルであること');
    assert.strictEqual(passChecks.items, 3, 'パスカードに3公演描画されること');
    assert.strictEqual(passChecks.copyLeftOfDl, true, '予定をコピーが上段左、画像を保存が上段右であること');
    assert.strictEqual(passChecks.shareBelowAndWide, true, 'SNSでシェアが下段全幅であること');
    assert.strictEqual(passChecks.borderUniform, true, 'パスカードアイテムに左縦色ラインが無いこと');

    // 予定をコピー実行＆クリップボード内容確認
    await page.click('#copy-plan-btn');
    await sleep(150);
    const copiedInfo = await page.evaluate(async () => {
      const label = document.getElementById('copy-plan-label')?.textContent;
      const attrText = document.getElementById('copy-plan-btn')?.getAttribute('data-copied-text') || '';
      let clipText = '';
      try {
        clipText = await navigator.clipboard.readText();
      } catch (_) {
        clipText = '';
      }
      return { label, clipText, attrText };
    });
    assert.strictEqual(copiedInfo.label, 'コピーしました', 'コピーボタンラベルが一時更新されること');
    const copiedTarget = copiedInfo.clipText || copiedInfo.attrText;
    const decodedCopy = decodeURIComponent(copiedTarget);
    assert.ok(decodedCopy.includes('plan=s1,s3,e2'), `コピー内容に plan=s1,s3,e2 共有URLが含まれること (got: ${copiedTarget})`);
    assert.ok(decodedCopy.includes('からくり時計塔からの脱出'), 'コピー内容に公演名が含まれること');
    assert.ok(decodedCopy.includes('#サンプル謎フェス'), 'コピー内容にハッシュタグが含まれること');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_6_pass_view.png') });

    // 画像を保存実行＆実際の PNG ファイル検証
    await page.click('#download-btn');
    let downloadedPngPath = null;
    for (let i = 0; i < 40; i++) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.png'));
      if (files.length > 0) {
        downloadedPngPath = path.join(DOWNLOAD_DIR, files[0]);
        break;
      }
      await sleep(200);
    }
    if (!downloadedPngPath) {
      const diag = await page.evaluate(() => ({
        dlLabel: document.getElementById('download-btn-label')?.textContent,
        iosGuideVisible: !document.getElementById('ios-share-guide')?.classList.contains('hidden')
      }));
      throw new Error(`PNG未検出: diag=${JSON.stringify(diag)}, dir=${JSON.stringify(fs.readdirSync(DOWNLOAD_DIR))}, consoleErrors=${JSON.stringify(consoleErrors)}`);
    }
    const pngBuf = fs.readFileSync(downloadedPngPath);
    assert.ok(pngBuf.length > 10000, `PNGファイルサイズが10KB超であること (${pngBuf.length} bytes)`);
    assert.strictEqual(pngBuf.subarray(0, 4).toString('hex'), '89504e47', '有効なPNGヘッダーであること');
    fs.copyFileSync(downloadedPngPath, path.join(ARTIFACT_DIR, 'v3_prod_6b_generated_pass.png'));

    // ダイアログ閉じる
    await page.click('#schedule-close-btn');
    await sleep(150);

    // 7. 絞り込み・便利機能モーダル（サイズ切替なし + 折りたたみ既プレイ除外）
    await page.click('#tools-open-btn');
    await sleep(150);
    await page.click('#exclude-played-details > summary');
    await sleep(100);
    // 1つ目の除外チェック（からくり時計塔以外の例として、最後のチェックを外す/付ける）
    const filterInfo = await page.evaluate(() => {
      const dlgText = document.getElementById('filter-dialog')?.innerText || '';
      const checkboxes = document.querySelectorAll('#exclude-played-list input[type="checkbox"]');
      return {
        hasZoomSection: dlgText.includes('表示サイズ') || dlgText.includes('全体俯瞰サイズ'),
        detailsOpen: document.getElementById('exclude-played-details')?.open,
        checkboxCount: checkboxes.length
      };
    });
    assert.strictEqual(filterInfo.hasZoomSection, false, '絞り込みモーダルにサイズ切替が存在しないこと');
    assert.strictEqual(filterInfo.detailsOpen, true, '既プレイ除外アコーディオンが開くこと');
    assert.ok(filterInfo.checkboxCount >= 4, '除外チェックリストに演目が並ぶこと');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'v3_prod_7_filter_modal.png') });

    // 効果測定用: タグ絞り込みチップを1つONにして filter_tag イベントを記録確認後、元に戻す
    const clickedTagName = await page.evaluate(() => {
      const chip = document.querySelector('#filter-tags-wrap .chip-btn');
      if (!chip) return '';
      chip.click();
      return chip.getAttribute('data-tag') || '';
    });
    assert.ok(clickedTagName.length > 0, '絞り込みタグチップをクリックできること');
    await sleep(60);
    await page.click('#filter-reset-btn');
    await sleep(60);

    await page.click('#filter-close-btn');
    await sleep(100);

    // 効果測定 (Analytics) イベント記録検証（DAY 2 遷移前に実行）
    const analyticsSummary = await page.evaluate(() => {
      const events = Array.isArray(window.__ANALYTICS_EVENTS__) ? window.__ANALYTICS_EVENTS__ : [];
      const actions = events.map(e => e.action);
      const viewPassEvent = events.find(e => e.action === 'view_pass');
      const filterEvent = events.find(e => e.action === 'filter_tag');
      return {
        totalCount: events.length,
        actions,
        viewPassTags: viewPassEvent ? viewPassEvent.selectedTags : [],
        filterTagRecorded: filterEvent ? filterEvent.filterTag : ''
      };
    });
    ['page_view', 'open_schedule', 'find_gaps', 'add_gap_show', 'view_pass', 'copy_plan', 'save_image', 'filter_tag'].forEach(act => {
      assert.ok(analyticsSummary.actions.includes(act), `Analytics に ${act} イベントが記録されていること (got: ${JSON.stringify(analyticsSummary.actions)})`);
    });
    assert.ok(analyticsSummary.viewPassTags.includes('ストーリー重視'), `selectedTags に「ストーリー重視」が含まれること (${JSON.stringify(analyticsSummary.viewPassTags)})`);
    assert.ok(analyticsSummary.viewPassTags.includes('スコアアタック'), `selectedTags に「スコアアタック」が含まれること (${JSON.stringify(analyticsSummary.viewPassTags)})`);
    assert.strictEqual(analyticsSummary.filterTagRecorded, clickedTagName, `filter_tag イベントに ${clickedTagName} が記録されること`);

    // 8. DAY 2 切替 + 共有URL(?plan=)プレビュー保護 + 重複赤警告検証
    await page.click('#day-next-btn');
    await sleep(320);
    const day2Info = await page.evaluate(() => ({
      badge: document.getElementById('day-badge')?.textContent,
      hasDay2Card: Boolean(document.getElementById('card-d2-1'))
    }));
    assert.strictEqual(day2Info.badge, 'DAY 2', 'DAY 2 に切り替わること');
    assert.strictEqual(day2Info.hasDay2Card, true, '2日目のカードが表示されること');

    // ?plan=l1,e1 (10:30-11:15 と 11:00-11:30 の重複) を共有URLとして開いた場合、持ち主の localStorage (s1,s3,e2) は維持されること
    const beforeShareState = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('plan_v3_')) || '';
      return { key, val: key ? localStorage.getItem(key) : null };
    });
    assert.ok(beforeShareState.key && beforeShareState.val, '保存済み予定キーが存在すること');
    await page.goto(`${BASE_URL}?mock=1&plan=l1,e1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#share-preview-banner:not(.hidden)');

    const sharePreviewChecks = await page.evaluate((planKey) => {
      const bannerVisible = !document.getElementById('share-preview-banner')?.classList.contains('hidden');
      const l1Conflict = document.getElementById('card-l1')?.classList.contains('is-conflict');
      const e1Conflict = document.getElementById('card-e1')?.classList.contains('is-conflict');
      const conflictAlertVisible = !document.getElementById('selection-conflict-alert')?.classList.contains('hidden');
      const savedDuringPreview = planKey ? localStorage.getItem(planKey) : null;
      return { bannerVisible, l1Conflict, e1Conflict, conflictAlertVisible, savedDuringPreview };
    }, beforeShareState.key);
    assert.strictEqual(sharePreviewChecks.bannerVisible, true, '?plan= アクセス時に共有プレビューバナーが出ること');
    assert.ok(sharePreviewChecks.l1Conflict && sharePreviewChecks.e1Conflict && sharePreviewChecks.conflictAlertVisible, '重複時に赤警告が出ること');
    assert.strictEqual(sharePreviewChecks.savedDuringPreview, beforeShareState.val, '共有URLプレビュー中に元の保存済み予定が上書きされないこと');

    assert.strictEqual(consoleErrors.length, 0, `console.error 0件: ${JSON.stringify(consoleErrors)}`);
    assert.strictEqual(pageErrors.length, 0, `pageerror 0件: ${JSON.stringify(pageErrors)}`);
    assert.strictEqual(failedRequests.length, 0, `ローカルHTTPエラー 0件: ${JSON.stringify(failedRequests)}`);

    console.log('ALL E2E ASSERTIONS PASSED!');
  } finally {
    if (browser) await browser.close();
    if (serverProc && !serverProc.killed) serverProc.kill();
  }
}

run().catch(err => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
