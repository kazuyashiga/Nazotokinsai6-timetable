#!/usr/bin/env node
/**
 * v2: 文字組みを先に決め、モチーフはその枠にはめる。
 *
 * 使い方:
 *   node compose.mjs <spec.json> <motif_dir> <out_dir> <work_dir> [id ...]
 *
 *   motif_dir/<id>.png … key_bg / inkify 済みのモチーフ（透過 PNG）または全面写真
 *   out_dir/<id>.png   … 完成ポスター
 *   work_dir/legibility.json … 文字の判読性チェック結果
 *
 * spec の posters[] の主な項目:
 *   title（\n で改行。行の途中では折り返さない）, group, genre, layout, font, fontQuery?, fontWeight?, subFont?,
 *   titleSize, lineColors?[], lineIndent?[], colors: { paper, title, sub, band, accent? },
 *   paperTexture?, motif: { slot:{x,y,w,h}, fit?, align?, rotate?, blend?, shadow?, role?, seatLine?, seatX?, hipY? },
 *   decor?: [ { type: rect|circle|arch|route|tape, ... } ]
 * layout: stack-top-left | block-bottom | band-top | band-bottom | mega-seat | photo-sticker | frame | proof
 * motif.type があれば motifs.mjs の図形モチーフをコードで描く（画像ファイル不要）。
 * title 内の {誤|正} は校正の赤字（誤を消して正を書き添える）として描く。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { MOTIFS, dotwordScript } from './motifs.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [specPath, motifDir, outDir, workDir, ...only] = process.argv.slice(2);
if (!specPath || !motifDir || !outDir || !workDir) {
  console.error('usage: node compose.mjs <spec.json> <motif_dir> <out_dir> <work_dir> [id ...]');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const [W, H] = spec.size ?? [1200, 1696];
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const q = (name) => name.replace(/ /g, '+');

/** 行は spec の改行どおり。行ごとに色・字下げを変えられる（文字単位では整然と、行単位では大胆に） */
function titleHtml(p) {
  const fix = (l) => l.replace(/\{([^|}]+)\|([^}]+)\}/g, '<span class="fix"><span class="del">$1</span><span class="corr">$2</span></span>');
  return esc(p.title).split('\n').map((l, i) => {
    const color = p.lineColors?.[i] ? `color:${p.lineColors[i]};` : '';
    const indent = p.lineIndent?.[i] ? `padding-left:${p.lineIndent[i]}px;` : '';
    const size = p.lineScale?.[i] ? `font-size:${p.lineScale[i]}em;` : '';
    return `<span class="ln" style="${color}${indent}${size}">${fix(l)}</span>`;
  }).join('');
}

function fontsHref(p) {
  const fams = [p.fontQuery ?? q(p.font), q(p.subFont ?? 'Zen Kaku Gothic New') + ':wght@500;700', 'JetBrains+Mono:wght@700', ...(p.extraFonts ?? [])];
  return `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f}`).join('&')}&display=block`;
}

/** コードで描く装飾（AI に描かせない部分） */
function decorHtml(p) {
  return (p.decor ?? []).map((d) => {
    const pos = `left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px;${d.z ? `z-index:${d.z};` : ''}`;
    const rot = d.rotate ? `transform:rotate(${d.rotate}deg);` : '';
    const shadow = d.shadow ? 'filter:drop-shadow(8px 12px 0 rgba(40,24,10,.18));' : '';
    switch (d.type) {
      case 'rect': return `<div class="decor" style="${pos}${rot}${shadow}background:${d.color}"></div>`;
      case 'circle': return `<div class="decor" style="${pos}${shadow}background:${d.color};border-radius:50%"></div>`;
      case 'arch': return `<div class="decor" style="${pos}${shadow}background:${d.color};border-radius:${d.w / 2}px ${d.w / 2}px 0 0"></div>`;
      case 'cropmarks': {
        // 校正紙のトンボ（四隅の L 字）
        const L = 60, o = d.inset ?? 48;
        const c = d.color;
        const k = (x, y, sx, sy) => `<path d="M${x + sx * 18},${y}h${sx * L}M${x},${y + sy * 18}v${sy * L}" stroke="${c}" stroke-width="2"/>`;
        return `<svg class="decor" style="left:0;top:0;width:${W}px;height:${H}px;z-index:4" viewBox="0 0 ${W} ${H}">${k(o, o, 1, 1)}${k(W - o, o, -1, 1)}${k(o, H - o, 1, -1)}${k(W - o, H - o, -1, -1)}<path d="M${W / 2 - 30},${o}h60M${W / 2},${o - 30}v60M${W / 2 - 30},${H - o}h60M${W / 2},${H - o - 30}v60" stroke="${c}" stroke-width="2"/><circle cx="${W / 2}" cy="${o}" r="16" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${W / 2}" cy="${H - o}" r="16" fill="none" stroke="${c}" stroke-width="2"/></svg>`;
      }
      case 'colorbar': {
        const cs = d.colors ?? ['#00A0E9', '#E4007F', '#FFF100', '#141414', '#7F7F7F', '#BFBFBF', '#E6E6E6'];
        const cw = d.w / cs.length;
        return `<svg class="decor" style="${pos}" viewBox="0 0 ${d.w} ${d.h}">${cs.map((c, i) => `<rect x="${i * cw}" width="${cw - 4}" height="${d.h}" fill="${c}"/>`).join('')}</svg>`;
      }
      case 'tape': return `<div class="decor" style="${pos}${rot}background:rgba(236,226,196,.82);mix-blend-mode:multiply"></div>`;
      case 'route': {
        // 点線のルートを角丸の輪で描き、通過点を打つ
        const r = d.radius ?? 120;
        const stops = (d.stops ?? []).map(([sx, sy]) => `<circle cx="${sx}" cy="${sy}" r="${d.dot ?? 14}" fill="${d.color}"/>`).join('');
        return `<svg class="decor" style="${pos}" viewBox="0 0 ${d.w} ${d.h}"><rect x="${d.stroke}" y="${d.stroke}" width="${d.w - d.stroke * 2}" height="${d.h - d.stroke * 2}" rx="${r}" fill="none" stroke="${d.color}" stroke-width="${d.stroke}" stroke-dasharray="${d.dash ?? '2 26'}" stroke-linecap="round"/>${stops}</svg>`;
      }
      default: throw new Error(`unknown decor: ${d.type}`);
    }
  }).join('');
}

function motifHtml(p, uri) {
  const m = p.motif ?? {};
  if (m.type) {
    if (!MOTIFS[m.type]) throw new Error(`unknown motif type: ${m.type}`);
    return MOTIFS[m.type](p, m);
  }
  if (!uri) return '';
  if (m.role === 'background') return `<img class="bgphoto" src="${uri}">`;
  const s = m.slot;
  const shadow = m.shadow === 'paper' ? 'filter:drop-shadow(10px 14px 0 rgba(40,24,10,.20));' : '';
  const blend = m.blend ? `mix-blend-mode:${m.blend};` : '';
  const rot = m.rotate ? `transform:rotate(${m.rotate}deg);` : '';
  const pos = m.align === 'bottom' ? 'center bottom' : 'center';
  return `<img class="motif" src="${uri}" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;object-fit:${m.fit ?? 'contain'};object-position:${pos};${shadow}${blend}${rot}">`;
}

function html(p, uri) {
  const c = p.colors;
  const sub = p.subFont ?? 'Zen Kaku Gothic New';
  const T = `<div class="title">${titleHtml(p)}</div>`;
  const G = `<div class="group">${esc(p.group)}</div>`;
  const J = `<div class="genre">${esc(p.genre)}</div>`;
  const gap = '<div class="gap"></div>';
  let type;
  switch (p.layout) {
    case 'stack-top-left':
    case 'mega-seat':
      type = `<div class="pad head">${J}${gap}${T}</div><div class="pad foot">${G}</div>`; break;
    case 'block-bottom':
    case 'band-bottom':
    case 'band-top':
      type = `<div class="panel">${J}${gap}${T}${gap}${G}</div>`; break;
    case 'photo-sticker':
      type = `<div class="sticker">${T}</div><div class="pad foot">${J}${gap}${G}</div>`; break;
    case 'frame':
      type = `<div class="border"></div><div class="panel">${J}${gap}${T}${gap}${G}</div>`; break;
    case 'proof':
      type = `<div class="pad head">${J}${gap}${T}</div><div class="pad foot">${G}</div>`; break;
    default:
      throw new Error(`unknown layout: ${p.layout}`);
  }
  // 紙の繊維：SVG のノイズを薄く乗算（写真背景では使わない）
  const texture = p.paperTexture === false || p.motif?.role === 'background' ? '' :
    `<svg class="texture" viewBox="0 0 ${W} ${H}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="${p.id.length}"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .25  0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

  // 寸法は 6px 基準（1200 = 6 × 200）
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontsHref(p)}">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; }
  body { position: relative; overflow: hidden; background: ${c.paper}; }
  .texture { position: absolute; inset: 0; width: 100%; height: 100%; mix-blend-mode: multiply; opacity: .22; z-index: 4; pointer-events: none; }
  .bgphoto { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .decor { position: absolute; z-index: 1; }
  .motif { position: absolute; z-index: 2; }
  .title, .group, .genre, .sticker, .panel, .head, .foot, .border { z-index: 3; }
  .title { font-family: '${p.font}', sans-serif; font-weight: ${p.fontWeight ?? 400}; font-size: ${p.titleSize}px;
           line-height: 1.08; letter-spacing: -0.01em; color: ${c.title}; font-feature-settings: 'palt'; }
  .title .ln { display: block; white-space: nowrap; }
  .group, .genre { width: fit-content; }
  .group { font-family: '${sub}', sans-serif; font-weight: 700; font-size: 42px; letter-spacing: 0.08em; color: ${c.sub}; }
  .genre { font-family: '${sub}', sans-serif; font-weight: 700; font-size: 30px; letter-spacing: 0.24em; color: ${c.sub}; }
  .sample { position: absolute; z-index: 5; right: 36px; bottom: 36px; font-family: 'JetBrains Mono', monospace; font-weight: 700;
            font-size: 24px; letter-spacing: 0.18em; color: ${c.band}; background: ${c.paper}; border: 3px solid currentColor; padding: 6px 12px; }
  .pad { position: absolute; left: 72px; right: 72px; }
  .gap { height: 24px; }

  .stack-top-left .head { top: 84px; }
  .stack-top-left .foot, .mega-seat .foot { bottom: 108px; }

  .mega-seat .head { top: 72px; }
  .mega-seat .title { line-height: 1.0; letter-spacing: -0.03em; }

  .block-bottom .panel { position: absolute; left: 0; right: 0; bottom: 0; padding: 60px 72px 132px; background: ${c.band}; }
  .band-top .panel, .band-bottom .panel { position: absolute; left: 0; right: 0; padding: 60px 72px; background: ${c.band}; }
  .band-top .panel { top: 0; }
  .band-bottom .panel { bottom: 0; padding-bottom: 132px; }

  .photo-sticker .sticker { position: absolute; top: 120px; right: 108px; max-height: ${H - 120 - 360}px; writing-mode: vertical-rl;
                            background: ${c.paper}; padding: 48px 36px; transform: rotate(-1.5deg);
                            box-shadow: 0 6px 18px rgba(0,0,0,.25); }
  .photo-sticker .foot { left: 72px; right: auto; bottom: 108px; background: ${c.paper}; padding: 24px 30px; }

  .proof .head { top: 420px; left: 108px; }
  .proof .foot { left: 108px; bottom: 132px; }
  .proof .title { line-height: 1.95; }
  .fix { position: relative; display: inline-block; }
  .fix .del { text-decoration: line-through double ${c.accent ?? '#D12A2A'}; text-decoration-thickness: 5px; text-decoration-skip-ink: none; }
  .fix .corr { position: absolute; left: 4%; bottom: 79%; font-family: '${p.corrFont ?? 'Klee One'}', sans-serif; font-weight: 600;
               font-size: 0.56em; color: ${c.accent ?? '#D12A2A'}; white-space: nowrap; transform: rotate(-3deg); letter-spacing: 0.04em; }
  .fix .corr::after { content: ''; position: absolute; left: 30%; top: 96%; width: 4px; height: 0.46em; background: currentColor; transform: rotate(14deg); }
  .frame .border { position: absolute; inset: 36px; border: 18px solid ${c.band}; }
  .frame .panel { position: absolute; top: 96px; left: 120px; right: 120px; padding: 48px 36px; background: ${c.paper};
                  border: 6px solid ${c.band}; text-align: center; }
</style></head>
<body class="${p.layout}">${p.motif?.type === 'dotword' ? `<script>${dotwordScript}</script>` : ''}${texture}${decorHtml(p)}${motifHtml(p, uri)}${type}<div class="sample">SAMPLE VISUAL</div></body></html>`;
}

/** 文字の判読性チェック（ブラウザ内）。文字を消した状態の画面を背景として、文字色とのコントラストを測る */
function legibilityInPage(bgUri) {
  // 列では 118px 幅まで縮むため、タイトルも「小さい文字」の WCAG 基準 4.5:1 で判定する
  const MIN = 4.5;
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = innerWidth; cv.height = innerHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const out = [];
      const targets = [...document.querySelectorAll('.title .ln, .corr, .group, .genre, .sample')];
      for (const el of targets) {
        const fg = lum(parse(getComputedStyle(el).color));
        const r = el.getBoundingClientRect();
        let bad = 0, total = 0, worst = 99;
        const d = ctx.getImageData(Math.max(0, r.left), Math.max(0, r.top), Math.max(1, Math.min(r.width, innerWidth - r.left)), Math.max(1, Math.min(r.height, innerHeight - r.top))).data;
        for (let i = 0; i < d.length; i += 4 * 5) {
          const k = ratio(fg, lum([d[i], d[i + 1], d[i + 2]]));
          total++; if (k < MIN) bad++; if (k < worst) worst = k;
        }
        out.push({ el: el.className || 'ln', text: el.textContent.slice(0, 16), badShare: +(bad / total).toFixed(3), worst: +worst.toFixed(2) });
      }
      resolve(out);
    };
    img.src = bgUri;
  });
}

/** 字組みの安定性チェック（spellbook TYPOGRAPHIC FLOW の STEP 7 を機械判定できる範囲で） */
function typesetInPage() {
  const issues = [];
  const lines = [...document.querySelectorAll('.title .ln')];
  for (const [i, ln] of lines.entries()) {
    const r = ln.getBoundingClientRect();
    if (r.right > innerWidth - 36 || r.left < 0 || r.bottom > innerHeight) issues.push(`${i + 1}行目が画面からはみ出しています`);
    // 行の途中で折り返していない（1 行の高さに収まっている）か
    const lh = parseFloat(getComputedStyle(ln).lineHeight) || parseFloat(getComputedStyle(ln).fontSize) * 1.2;
    const vertical = getComputedStyle(ln).writingMode.startsWith('vertical');
    const extent = vertical ? r.width : r.height;
    if (extent > lh * 1.5) issues.push(`${i + 1}行目が行内で折り返しています`);
  }
  return issues;
}

const report = {};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// ページ内のエラーは黙って白紙になるので、必ず表に出す
page.on('pageerror', (e) => console.warn(`page error: ${e.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') console.warn(`page console: ${msg.text()}`); });
for (const p of spec.posters) {
  if (only.length && !only.includes(p.id)) continue;
  const src = path.join(motifDir, `${p.id}.png`);
  const uri = fs.existsSync(src) ? `data:image/png;base64,${fs.readFileSync(src).toString('base64')}` : '';
  if (!uri && !p.motif?.type) console.warn(`warn ${p.id}: モチーフ ${src} がありません（文字組みだけで書き出します）`);
  await page.setContent(html(p, uri), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__motifReady !== false, null, { timeout: 15000 });
  const missing = await page.evaluate((f) => !document.fonts.check(`40px "${f}"`, 'あ'), p.font);
  if (missing) console.warn(`warn ${p.id}: 書体 "${p.font}" を読み込めていません`);

  // 1) 行が枠からはみ出す間、タイトルを 2px ずつ縮める
  const fitted = await page.evaluate(() => {
    const t = document.querySelector('.title');
    const box = t.closest('.sticker') ?? t;
    const vertical = getComputedStyle(box).writingMode.startsWith('vertical');
    const over = () => (vertical ? box.scrollHeight > box.clientHeight + 1 : t.scrollWidth > t.clientWidth + 1);
    let size = parseFloat(getComputedStyle(t).fontSize);
    while (over() && size > 24) { size -= 2; t.style.fontSize = `${size}px`; }
    return size;
  });
  if (fitted < p.titleSize) console.log(`fit ${p.id}: タイトルを ${p.titleSize}px → ${fitted}px に縮小`);

  // 2) 腰掛けるモチーフ：指定行の字面の上端に「腰」の高さを合わせる（字形は変えず、モチーフ側を動かす）
  const m = p.motif ?? {};
  if (m.role === 'seat' && uri) {
    await page.evaluate(({ line, seatX, hipY }) => {
      const ln = document.querySelectorAll('.title .ln')[line];
      const img = document.querySelector('.motif');
      const r = ln.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(ln).fontSize);
      const glyphTop = r.top + (r.height - fs) / 2 + fs * 0.06;
      const w = img.getBoundingClientRect().width;
      const h = img.getBoundingClientRect().height;
      // object-fit: contain の実描画高さを求める
      const ratio = img.naturalHeight / img.naturalWidth;
      const drawnH = Math.min(h, w * ratio);
      const offset = (h - drawnH); // align bottom
      img.style.objectPosition = 'center bottom';
      img.style.top = `${glyphTop - offset - drawnH * hipY}px`;
      img.style.left = `${r.left + r.width * seatX - w / 2}px`;
    }, { line: m.seatLine ?? 0, seatX: m.seatX ?? 0.7, hipY: m.hipY ?? 0.58 });
  }

  // 3) 判読性：文字を消した画面を背景として撮り、文字色と比べる
  const hide = await page.addStyleTag({ content: '.title, .title .ln, .corr, .group, .genre, .sample { color: transparent !important; border-color: transparent !important; }' });
  const bgShot = (await page.screenshot()).toString('base64');
  await hide.evaluate((el) => el.remove());
  const checks = await page.evaluate(legibilityInPage, `data:image/png;base64,${bgShot}`);
  const typeset = await page.evaluate(typesetInPage);
  report[p.id] = { titleSize: fitted, legibility: checks, typeset };
  // 文字の背後の 15% 超が 4.5:1 未満なら「絵に埋もれている」とみなす
  for (const c of checks) {
    if (c.badShare > 0.15) console.warn(`FAIL ${p.id} ${c.el}「${c.text}」: 背景とのコントラスト 4.5:1 未満が ${(c.badShare * 100).toFixed(0)}%（最小 ${c.worst}:1）`);
  }
  for (const t of typeset) console.warn(`FAIL ${p.id} 字組み: ${t}`);

  const out = path.join(outDir, `${p.id}.png`);
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
fs.writeFileSync(path.join(workDir, 'legibility.json'), JSON.stringify(report, null, 2));
