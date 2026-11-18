import * as htmlToImage from 'html-to-image';
import { Parser } from '../core/Parser.js';
import { ConflictDetector } from '../core/ConflictDetector.js';
import { Storage } from '../core/Storage.js';
import { Analytics } from '../core/Analytics.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// チケットの型抜き：四隅の切り欠き半径／ミシン目の左右の切り欠き半径／題字箱の角の切り欠き半径（px）
const PASS_CORNER_R = 10;
const PASS_NOTCH_R = 7;
const PASS_BOX_R = 6;

const round2 = (n) => Math.round(n * 100) / 100;
const toSvgDataUrl = (svg) => `url("data:image/svg+xml;base64,${btoa(svg)}")`;

/**
 * 四隅とミシン目（左右）が凹んだ外形を、内側へ d だけ寄せた輪郭の SVG path を返す。
 * 凹んだ角も切り欠きと同心の円弧で曲がるので、外枠の線が型抜きに沿って回り込む。
 */
function notchedOutlinePath(x0, y0, x1, y1, cornerR, notchYs, notchR, d) {
  const R = cornerR + d;
  const a = Math.sqrt(Math.max(R * R - d * d, 0));
  const Rn = notchR + d;
  const b = Math.sqrt(Math.max(Rn * Rn - d * d, 0));
  const L = x0 + d;
  const Rt = x1 - d;
  const T = y0 + d;
  const B = y1 - d;
  const n = round2;
  let p = `M ${n(x0 + a)} ${n(T)} L ${n(x1 - a)} ${n(T)} A ${n(R)} ${n(R)} 0 0 0 ${n(Rt)} ${n(y0 + a)}`;
  notchYs.forEach((ny) => {
    p += ` L ${n(Rt)} ${n(ny - b)} A ${n(Rn)} ${n(Rn)} 0 0 0 ${n(Rt)} ${n(ny + b)}`;
  });
  p += ` L ${n(Rt)} ${n(y1 - a)} A ${n(R)} ${n(R)} 0 0 0 ${n(x1 - a)} ${n(B)}`;
  p += ` L ${n(x0 + a)} ${n(B)} A ${n(R)} ${n(R)} 0 0 0 ${n(L)} ${n(y1 - a)}`;
  [...notchYs].reverse().forEach((ny) => {
    p += ` L ${n(L)} ${n(ny + b)} A ${n(Rn)} ${n(Rn)} 0 0 0 ${n(L)} ${n(ny - b)}`;
  });
  p += ` L ${n(L)} ${n(y0 + a)} A ${n(R)} ${n(R)} 0 0 0 ${n(x0 + a)} ${n(T)} Z`;
  return p;
}

/**
 * 保存PNGに描くため CORS 付きで取得できる画像 URL にする。
 * Google ドライブの thumbnail URL は CORS で取得できない（リダイレクト元に許可ヘッダが無い）ため、
 * 許可ヘッダを返す lh3.googleusercontent.com 形式に置き換える
 */
function toCorsImageUrl(url) {
  const converted = Parser.convertDriveUrl(url);
  const m = converted.match(/^https:\/\/drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w2000` : converted;
}

/** 1〜31 を漢数字に（消印の日付用） */
function toKanjiNumber(num) {
  const digits = '〇一二三四五六七八九';
  if (num < 10) return digits[num];
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return `${tens === 1 ? '' : digits[tens]}十${ones ? digits[ones] : ''}`;
}

/**
 * 「My ハシゴテーブル」パス表示・テキストコピー・画像保存・SNSシェアを担当するビュークラス
 */
export class TicketView {
  constructor() {
    this.config = {};
    this.shows = [];
    this.selectedIds = new Set();
    this.logoDataUrl = null;
    this.loadedLogoSource = '';
    this.titleVisualDataUrl = null;
    this.loadedVisualSource = '';
    this.isGenerating = false;
    this._copyResetTimer = null;
    this._activeGuideUrl = null;
    this.lastCopiedText = '';
    this._passShape = null;
    this._bindFoilTilt();
    this._bindPassFrame();
  }

  /**
   * 紙の大きさ（公演数・題字・書体の読み込み）が変わるたびに、型抜きと外枠を描き直す
   */
  _bindPassFrame() {
    const card = document.getElementById('capture-area');
    if (!card) return;
    if (typeof ResizeObserver !== 'undefined') {
      this._frameObserver = new ResizeObserver(() => this._drawPassFrame());
      this._frameObserver.observe(card);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this._drawPassFrame()).catch(() => {});
    }
  }

  /**
   * チケットの型抜き（紙のマスク）と、外枠・題字箱の線（インクの版＋箔の版）を紙の実寸で描く。
   * - 外枠：太線・点の帯・細線の三重。上下中央に菱形の飾り。四隅とミシン目の切り欠きに沿って曲がる
   * - インクの版は線の色を焼き込んだ SVG 背景（PNG にもそのまま写る）
   * - 箔の版は同じ線の形のマスクで箔の面を切り抜く（画面のみ。PNG は常に光なし）
   */
  _drawPassFrame() {
    const card = document.getElementById('capture-area');
    if (!card) return;
    const W = card.offsetWidth;
    const H = card.offsetHeight;
    if (!W || !H) return;

    const notches = Array.from(card.querySelectorAll('.pass-perf'))
      .map(el => el.offsetTop + el.offsetHeight / 2);

    // 1) 型抜きの外形（紙そのもののマスク）
    const shapePath = notchedOutlinePath(0, 0, W, H, PASS_CORNER_R, notches, PASS_NOTCH_R, 0);
    this._passShape = { path: shapePath, w: W, h: H };
    const shapeUrl = toSvgDataUrl(`<svg xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path fill="#fff" d="${shapePath}"/></svg>`);
    card.style.webkitMaskImage = shapeUrl;
    card.style.maskImage = shapeUrl;

    // 2) 外枠：太線（内側 6px）・点の帯（10.5px）・細線（15px）
    const outer = notchedOutlinePath(0, 0, W, H, PASS_CORNER_R, notches, PASS_NOTCH_R, 6);
    const inner = notchedOutlinePath(0, 0, W, H, PASS_CORNER_R, notches, PASS_NOTCH_R, 15);
    const dots = this._sampleDots(notchedOutlinePath(0, 0, W, H, PASS_CORNER_R, notches, PASS_NOTCH_R, 10.5), W, H);
    const diamond = (cx, cy, rx, ry) => `<path d="M ${round2(cx)} ${round2(cy - ry)} L ${round2(cx + rx)} ${round2(cy)} L ${round2(cx)} ${round2(cy + ry)} L ${round2(cx - rx)} ${round2(cy)} Z"/>`;
    const ornaments = [[W / 2, 10.5], [W / 2, H - 10.5]]
      .map(([x, y]) => diamond(x, y, 6.5, 4.2) + diamond(x - 10, y, 2, 1.6) + diamond(x + 10, y, 2, 1.6))
      .join('');

    // 3) 題字の箱（外枠と同じ版・同じ角の処理）
    let boxLines = '';
    const box = document.getElementById('pass-title-box');
    if (box && box.offsetWidth && box.offsetHeight) {
      const bx0 = box.offsetLeft;
      const by0 = box.offsetTop;
      const bx1 = bx0 + box.offsetWidth;
      const by1 = by0 + box.offsetHeight;
      boxLines = `<path d="${notchedOutlinePath(bx0, by0, bx1, by1, PASS_BOX_R, [], 0, 0)}" stroke-width="1.6"/>`
        + `<path d="${notchedOutlinePath(bx0, by0, bx1, by1, PASS_BOX_R, [], 0, 3.5)}" stroke-width="0.7"/>`;
    }

    const frameSvg = (color) => `<svg xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
      + `<g fill="none" stroke="${color}"><path d="${outer}" stroke-width="2.2"/><path d="${inner}" stroke-width="0.9"/>${boxLines}</g>`
      + `<g fill="${color}">${dots}${ornaments}</g></svg>`;

    const inkLayer = card.querySelector('.pass-frame.is-ink');
    if (inkLayer) {
      const inkColor = getComputedStyle(inkLayer).color || '#8a1c2b';
      inkLayer.style.backgroundImage = toSvgDataUrl(frameSvg(inkColor));
    }
    const foilLayer = card.querySelector('.pass-frame.is-foil');
    if (foilLayer) {
      const maskUrl = toSvgDataUrl(frameSvg('#fff'));
      foilLayer.style.webkitMaskImage = maskUrl;
      foilLayer.style.maskImage = maskUrl;
    }
  }

  /**
   * 消印の外周の文字を1字ずつ置く。
   * textPath や letter-spacing はブラウザ・PNG書き出しで位置がずれやすいため使わず、
   * 帯の中心（半径27.5）に字の中心を合わせ、真上／真下を中心に左右対称に並べる。
   * 上の弧は字の頭が外向き、下の弧は字の頭が内向き（どちらも左から右へ読める）
   */
  _renderPostmarkRing(topText, bottomText) {
    const ring = document.getElementById('pass-postmark-ring');
    if (!ring) return;
    const CX = 35;
    const CY = 35;
    const R = 27.5;
    const FONT = 7;
    const STEP = 17.5; // 1字あたりの角度（度）
    const glyph = (ch, deg, rotate) => {
      const rad = (deg * Math.PI) / 180;
      const x = round2(CX + R * Math.cos(rad));
      const y = round2(CY + R * Math.sin(rad));
      return `<text x="${x}" y="${y}" font-size="${FONT}" text-anchor="middle" dominant-baseline="central" transform="rotate(${round2(rotate)} ${x} ${y})">${Parser.escapeHtml(ch)}</text>`;
    };
    const arc = (text, centerDeg, isTop) => {
      const chars = Array.from(text);
      return chars.map((ch, i) => {
        const offset = (i - (chars.length - 1) / 2) * STEP;
        // 上：角度が増える向き（左→右）／下：角度が減る向き（左→右）
        const deg = isTop ? centerDeg + offset : centerDeg - offset;
        return glyph(ch, deg, isTop ? deg + 90 : deg - 90);
      }).join('');
    };
    const dot = (deg) => {
      const rad = (deg * Math.PI) / 180;
      return `<circle cx="${round2(CX + R * Math.cos(rad))}" cy="${round2(CY + R * Math.sin(rad))}" r="1.1"/>`;
    };
    ring.innerHTML = arc(topText, -90, true) + arc(bottomText, 90, false) + dot(180) + dot(0);
  }

  /**
   * 外枠の点の帯：輪郭に沿って約 6.4px 間隔で点を置く（上下中央の菱形の周りは空ける）
   */
  _sampleDots(pathD, W, H) {
    if (!this._probePath) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
      this._probePath = document.createElementNS(SVG_NS, 'path');
      svg.appendChild(this._probePath);
      document.body.appendChild(svg);
    }
    this._probePath.setAttribute('d', pathD);
    const total = this._probePath.getTotalLength();
    if (!total) return '';
    const step = total / Math.max(1, Math.round(total / 6.4));
    const jewels = [[W / 2, 10.5], [W / 2, H - 10.5]];
    let dots = '';
    for (let s = 0; s < total - 0.5; s += step) {
      const pt = this._probePath.getPointAtLength(s);
      if (jewels.some(([jx, jy]) => Math.hypot(pt.x - jx, pt.y - jy) < 10)) continue;
      dots += `<circle cx="${round2(pt.x)}" cy="${round2(pt.y)}" r="0.95"/>`;
    }
    return dots;
  }

  /**
   * チケットの 3D チルトと箔の光（詳細カードのメインビジュアルと同じ操作感）
   * - 正面（無操作）では --foil = 0 で「ただの活版印刷」
   * - 指・マウスで傾けると、傾きの大きさで箔が現れ（--foil）、傾きの向きで光る位置（--sheen）が流れる
   * - 縦方向のスワイプはスクロールに譲る（touch-action: pan-y）
   */
  _bindFoilTilt() {
    const stage = document.getElementById('schedule-panel-pass');
    const card = document.getElementById('capture-area');
    if (!stage || !card) return;

    const MAX_DEG = 7;
    const reduceMotion = () => typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const apply = (clientX, clientY) => {
      if (card.classList.contains('is-capturing')) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const relX = Math.max(-0.5, Math.min(0.5, (clientX - rect.left) / rect.width - 0.5));
      const relY = Math.max(-0.5, Math.min(0.5, (clientY - rect.top) / rect.height - 0.5));
      const ry = relX * 2 * MAX_DEG;
      const rx = -relY * 2 * MAX_DEG;
      // 正面付近（中央）では光らず、端へ傾けるほど箔が見えてくる
      const strength = Math.min(1, Math.hypot(relX, relY * 0.8) * 2.4);
      const sheen = 50 + relX * 90 + relY * 40;

      card.classList.add('is-tilting');
      if (!reduceMotion()) {
        card.style.setProperty('--tilt-rx', `${rx.toFixed(2)}deg`);
        card.style.setProperty('--tilt-ry', `${ry.toFixed(2)}deg`);
      }
      card.style.setProperty('--foil', strength.toFixed(3));
      card.style.setProperty('--sheen', `${Math.max(-10, Math.min(110, sheen)).toFixed(1)}%`);
    };

    const reset = () => {
      card.classList.remove('is-tilting');
      card.style.setProperty('--tilt-rx', '0deg');
      card.style.setProperty('--tilt-ry', '0deg');
      card.style.setProperty('--foil', '0');
      card.style.setProperty('--sheen', '50%');
    };

    stage.addEventListener('pointermove', (e) => apply(e.clientX, e.clientY));
    stage.addEventListener('pointerdown', (e) => apply(e.clientX, e.clientY));
    stage.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') reset(); });
    stage.addEventListener('pointerleave', reset);
    stage.addEventListener('pointercancel', reset);
    this._resetFoilTilt = reset;
  }

  /**
   * 保存PNG用の Web フォント CSS を作る。
   * チケットに実際に出ている文字だけを含むサブセットを Google Fonts から取得し、data URL として埋め込む。
   * （全グリフを埋め込むと重すぎ、埋め込まないと端末の代用書体で文字幅が変わり改行が崩れるため）
   * @returns {Promise<string|null>} 失敗時は null（呼び出し側で従来どおりフォント非埋め込みにする）
   */
  async _buildSubsetFontCSS(area) {
    const foilTexts = Array.from(area.querySelectorAll('[data-foil-text]'))
      .map(el => el.getAttribute('data-foil-text') || '');
    // 消印などインライン SVG の文字は innerText に含まれないことがあるため別に集める
    const svgTexts = Array.from(area.querySelectorAll('svg text')).map(el => el.textContent || '');
    const chars = new Set(`${area.innerText}${foilTexts.join('')}${svgTexts.join('')}0123456789:-/（）()#`);
    // 文字列そのものではなく、重複を除いて並べ替えた文字集合だけを送る
    const text = Array.from(chars).filter(c => c.trim()).sort().join('');
    if (!text) return null;
    if (this._subsetFontCache && this._subsetFontCache.text === text) {
      return this._subsetFontCache.css;
    }

    const families = [
      'Kaisei+Decol:wght@700',
      'Shippori+Mincho+B1:wght@700;800',
      'Noto+Sans+JP:wght@700;900',
      'JetBrains+Mono:wght@700;800',
      'Plus+Jakarta+Sans:wght@700;800'
    ].map(f => `family=${f}`).join('&');
    const cssUrl = `https://fonts.googleapis.com/css2?${families}&text=${encodeURIComponent(text)}&display=block`;

    const build = async () => {
      const res = await fetch(cssUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`font css HTTP ${res.status}`);
      let css = await res.text();
      const fontUrls = Array.from(new Set(Array.from(css.matchAll(/url\((https:[^)]+)\)/g), m => m[1])));
      const dataUrls = await Promise.all(fontUrls.map(async (u) => {
        const fontRes = await fetch(u, { mode: 'cors' });
        if (!fontRes.ok) throw new Error(`font HTTP ${fontRes.status}`);
        const blob = await fontRes.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }));
      fontUrls.forEach((u, i) => { css = css.split(u).join(dataUrls[i]); });
      return css;
    };

    const css = await Promise.race([
      build(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('font subset timeout')), 5000))
    ]);
    this._subsetFontCache = { text, css };
    return css;
  }

  /**
   * チケット用の開催日表記（例：11月14日（土））。シートの日程ラベルがあればそれを優先
   */
  formatPassDate(rawDateStr, activeDay = 1) {
    const dayNum = this._parseDayNum(activeDay);
    const dayLabels = Array.isArray(this.config.dayLabels) ? this.config.dayLabels : [];
    const customLabel = String(dayLabels[dayNum - 1] || '').trim();
    if (customLabel) {
      // 「11/14(土)」形式は活版らしく「11月14日（土）」へ
      const md = customLabel.match(/^(\d{1,2})\/(\d{1,2})\s*[（(]\s*(\S)\s*[)）]$/);
      return md ? `${Number(md[1])}月${Number(md[2])}日（${md[3]}）` : customLabel;
    }

    const s = String(rawDateStr || '').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length === 8) {
      const y = parseInt(digits.slice(0, 4), 10);
      const m = parseInt(digits.slice(4, 6), 10);
      const d = parseInt(digits.slice(6, 8), 10);
      const dt = new Date(y, m - 1, d);
      const wd = Number.isNaN(dt.getTime()) ? '' : `（${'日月火水木金土'[dt.getDay()]}）`;
      return `${m}月${d}日${wd}`;
    }
    return s;
  }

  /**
   * 描画・共有に必要なコンテキストを設定
   */
  setContext(config, shows, selectedIds) {
    this.config = config || {};
    this.shows = shows || [];
    this.selectedIds = new Set(selectedIds);

    const nextLogo = this.config.logoUrl ? String(this.config.logoUrl).trim() : '';
    if (nextLogo && nextLogo !== this.loadedLogoSource) {
      this.preloadLogo(nextLogo);
    } else if (!nextLogo) {
      this.logoDataUrl = null;
      this.loadedLogoSource = '';
    }

    const nextVisual = this.config.ticketVisualUrl ? String(this.config.ticketVisualUrl).trim() : '';
    if (nextVisual && nextVisual !== this.loadedVisualSource) {
      this.preloadTitleVisual(nextVisual);
    } else if (!nextVisual) {
      this.titleVisualDataUrl = null;
      this.loadedVisualSource = '';
    }
  }

  _parseDayNum(dayVal) {
    const m = String(dayVal ?? '1').match(/\d+/);
    return m ? parseInt(m[0], 10) : 1;
  }

  /**
   * 開催日文字列を表示向けに整形
   */
  formatFesDate(rawDateStr, activeDay = 1) {
    const dayNum = this._parseDayNum(activeDay);
    const dayLabels = Array.isArray(this.config.dayLabels) ? this.config.dayLabels : [];
    const customLabel = dayLabels[dayNum - 1] || '';
    if (customLabel) {
      return `DAY ${dayNum} / ${customLabel}`;
    }

    const s = String(rawDateStr || '').trim();
    if (!s) return `DAY ${dayNum}`;

    const digits = s.replace(/\D/g, '');
    if (digits.length === 8) {
      const y = parseInt(digits.slice(0, 4), 10);
      const m = parseInt(digits.slice(4, 6), 10);
      const d = parseInt(digits.slice(6, 8), 10);
      const dt = new Date(y, m - 1, d);
      const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const wd = Number.isNaN(dt.getTime()) ? '' : ` (${weekdays[dt.getDay()]})`;
      return `DAY ${dayNum} / ${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}${wd}`;
    }
    return `DAY ${dayNum} / ${s}`;
  }

  /**
   * CORS問題や画像生成遅延を防ぐためロゴを事前ロードして DataURL 化
   */
  async preloadLogo(logoUrl) {
    this.loadedLogoSource = logoUrl;
    try {
      const dataUrl = await this._fetchAsDataUrl(logoUrl);
      if (this.loadedLogoSource !== logoUrl) return;
      this.logoDataUrl = dataUrl;
    } catch (e) {
      console.warn('Logo preload skipped due to CORS or network error:', e);
      this.logoDataUrl = null;
    }
    this._applyTitleVisual();
  }

  /**
   * 題字画像（メインビジュアル等）を事前ロードして DataURL 化。
   * 画面と保存PNGを一致させるため、読み込めなかったときは文字の題字のままにする
   */
  async preloadTitleVisual(visualUrl) {
    this.loadedVisualSource = visualUrl;
    try {
      const dataUrl = await this._fetchAsDataUrl(visualUrl);
      if (this.loadedVisualSource !== visualUrl) return;
      this.titleVisualDataUrl = dataUrl;
    } catch (e) {
      console.warn('Ticket title visual skipped due to CORS or network error:', e);
      this.titleVisualDataUrl = null;
    }
    this._applyTitleVisual();
  }

  async _fetchAsDataUrl(url) {
    const res = await fetch(toCorsImageUrl(url), { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (typeof dataUrl !== 'string') throw new Error('DataURL 化に失敗しました');
    return dataUrl;
  }

  /**
   * 題字部分を「題字画像」または「（ロゴ＋）文字の題字」に切り替える。
   * 題字画像がある時はロゴを出さない（題字画像にロゴが含まれる想定）。文字の題字は読み上げ用に残す
   */
  _applyTitleVisual() {
    const box = document.getElementById('pass-title-box');
    const visualEl = document.getElementById('pass-title-visual');
    const logoEl = document.getElementById('modal-fes-logo');
    const hasVisual = Boolean(this.titleVisualDataUrl);

    if (visualEl) {
      if (hasVisual) {
        if (visualEl.getAttribute('src') !== this.titleVisualDataUrl) visualEl.src = this.titleVisualDataUrl;
        visualEl.classList.remove('hidden');
      } else {
        visualEl.removeAttribute('src');
        visualEl.classList.add('hidden');
      }
    }
    if (box) box.classList.toggle('has-visual', hasVisual);

    if (logoEl) {
      if (!hasVisual && this.logoDataUrl) {
        if (logoEl.getAttribute('src') !== this.logoDataUrl) logoEl.src = this.logoDataUrl;
        logoEl.classList.remove('hidden');
      } else {
        logoEl.removeAttribute('src');
        logoEl.classList.add('hidden');
      }
    }
  }

  /**
   * 指定日程の選択済み公演をタイムライン順に取得
   */
  getDaySelectedShows(activeDay = 1) {
    const dayNum = this._parseDayNum(activeDay);
    return this.shows
      .filter(s => this.selectedIds.has(s.id) && this._parseDayNum(s.day) === dayNum)
      .sort((a, b) => {
        const aFlex = ConflictDetector.isFlexibleShow(a) ? 1 : 0;
        const bFlex = ConflictDetector.isFlexibleShow(b) ? 1 : 0;
        if (aFlex !== bFlex) return aFlex - bFlex;
        return a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes;
      });
  }

  /**
   * パス見出し文字列を返す
   */
  getPassHeading() {
    const baseTitle = this.config.title || 'タイムテーブル';
    if (baseTitle.includes('タイムテーブル')) {
      return baseTitle.replace('タイムテーブル', 'My ハシゴテーブル');
    }
    return `${baseTitle} My ハシゴテーブル`;
  }

  /**
   * My ハシゴテーブルの DOM を最新状態に描画（左縦色ラインなし）
   */
  render(activeDay = 1) {
    const titleEl = document.getElementById('modal-fes-title');
    const dateBadge = document.getElementById('pass-date-badge');
    const dateLine = document.getElementById('pass-date-line');
    const container = document.getElementById('pass-items-container');
    const hashtagEl = document.getElementById('modal-hashtag');
    const iosGuide = document.getElementById('ios-share-guide');

    if (iosGuide) {
      iosGuide.classList.add('hidden');
      iosGuide.innerHTML = '';
    }
    this._revokeGuideUrl();

    // 表示し直すたびに正面（光なし）から始める
    if (this._resetFoilTilt) this._resetFoilTilt();

    if (titleEl) {
      const heading = this.getPassHeading();
      titleEl.textContent = heading;
      titleEl.setAttribute('data-foil-text', heading);
    }

    this._applyTitleVisual();

    const dayNum = this._parseDayNum(activeDay);
    const kickerEl = document.getElementById('pass-day-kicker');
    if (kickerEl) {
      kickerEl.textContent = `DAY ${dayNum}`;
    }

    const passDate = this.formatPassDate(this.config.displayDate || this.config.date, activeDay);
    if (dateBadge) {
      dateBadge.textContent = passDate;
    }
    if (dateLine) {
      dateLine.classList.toggle('hidden', !passDate);
    }

    // 消印：中央に日程、上の弧に「謎解きハシゴ」、下の弧に漢数字の月日（日付が読み取れない時は空ける）
    const postmarkDay = document.getElementById('pass-postmark-day');
    if (postmarkDay) postmarkDay.textContent = `DAY ${dayNum}`;
    const md = passDate.match(/(\d{1,2})月(\d{1,2})日/);
    this._renderPostmarkRing(
      '謎解きハシゴ',
      md ? `${toKanjiNumber(Number(md[1]))}月${toKanjiNumber(Number(md[2]))}日` : ''
    );

    if (hashtagEl) {
      const hashtag = this.config.hashtag || '#ハシゴテーブル';
      hashtagEl.textContent = hashtag;
      hashtagEl.setAttribute('data-foil-text', hashtag);
    }

    if (!container) return;

    const dayShows = this.getDaySelectedShows(activeDay);
    const countEl = document.getElementById('pass-count');
    if (countEl) {
      countEl.textContent = dayShows.length > 0 ? `全 ${dayShows.length} 公演` : '';
    }
    if (dayShows.length === 0) {
      container.innerHTML = `
        <div class="pass-empty">
          <div class="pass-empty-title">この日に選択されている公演はありません</div>
          <div class="pass-empty-note">タイムテーブルから気になる公演をタップして追加してください</div>
        </div>
      `;
      this._drawPassFrame();
      return;
    }

    container.innerHTML = dayShows.map((s, idx) => {
      const serial = String(idx + 1);
      const isFlex = ConflictDetector.isFlexibleShow(s);
      const flexEndLabel = s.totalEndTime || s.acceptEndTime || '';
      const timeText = isFlex
        ? (flexEndLabel ? `随時受付 (${s.startTime}-${flexEndLabel})` : `随時受付 (${s.displayDuration || '時間自由'})`)
        : `${s.startTime} - ${s.endTime || Parser.minutesToTime(s.endMinutes)}`;
      const roomText = s.room && s.room !== '-' ? s.room : '会場未設定';
      const groupText = `${s.groupName || '出展団体'}${s.displayDuration ? ` / ${s.displayDuration}` : ''}`;

      return `
        <div class="pass-item">
          <span class="pass-item-index foil" data-foil-text="${serial}">${serial}</span>
          <div class="pass-item-meta">
            <span class="pass-item-time"><span class="pass-field">時間</span><span class="pass-item-time-tag">${Parser.escapeHtml(timeText)}</span></span>
            <span class="pass-item-room"><span class="pass-field">会場</span>${Parser.escapeHtml(roomText)}</span>
          </div>
          <div class="pass-item-title">${Parser.escapeHtml(s.title)}</div>
          <div class="pass-item-group">${Parser.escapeHtml(groupText)}</div>
        </div>
      `;
    }).join('');
    this._drawPassFrame();
  }

  /**
   * テキスト＋共有URL（?plan=）を生成してクリップボードへコピー
   */
  async copyPlanTextAndUrl(activeDay = 1) {
    Analytics.track('copy_plan', { selectedIds: Array.from(this.selectedIds) });
    const dayShows = this.getDaySelectedShows(activeDay);
    const allSelectedIds = Array.from(this.selectedIds);
    const shareUrl = Storage.encodeSharePlan(allSelectedIds);
    const dayLabel = this.formatFesDate(this.config.displayDate || this.config.date, activeDay);
    const title = this.config.title || 'タイムテーブル';
    const hashtag = this.config.hashtag ? `\n${this.config.hashtag}` : '';

    const lines = dayShows.map(s => {
      const isFlex = ConflictDetector.isFlexibleShow(s);
      const flexEndLabel = s.totalEndTime || s.acceptEndTime || '';
      const timeText = isFlex
        ? (flexEndLabel ? `随時受付(${s.startTime}-${flexEndLabel})` : '随時受付')
        : `${s.startTime}-${s.endTime || Parser.minutesToTime(s.endMinutes)}`;
      const roomPart = s.room && s.room !== '-' ? ` / ${s.room}` : '';
      return `・${timeText}｜${s.title}（${s.groupName || ''}${roomPart}）`;
    });

    const body = lines.length > 0 ? lines.join('\n') : '・（この日の選択公演はありません）';
    const summaryText = `【${title}（${dayLabel}）ハシゴ予定】\n${body}\n\n合計 ${dayShows.length}公演\n共有URL: ${shareUrl}${hashtag}`;
    this.lastCopiedText = summaryText;
    document.getElementById('copy-plan-btn')?.setAttribute('data-copied-text', summaryText);

    const ok = await this._copyToClipboard(summaryText);
    const labelEl = document.getElementById('copy-plan-label');
    if (labelEl) {
      if (this._copyResetTimer) clearTimeout(this._copyResetTimer);
      labelEl.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
      this._copyResetTimer = setTimeout(() => {
        labelEl.textContent = '予定をコピー';
      }, 2200);
    }
    return ok;
  }

  async _copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // フォールバックへ
    }
    try {
      const host = document.querySelector('dialog[open]') || document.body;
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      host.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const result = document.execCommand('copy');
      host.removeChild(ta);
      return result;
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
      return false;
    }
  }

  _isIOSDevice() {
    const ua = navigator.userAgent || '';
    return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  _revokeGuideUrl() {
    if (this._activeGuideUrl) {
      URL.revokeObjectURL(this._activeGuideUrl);
      this._activeGuideUrl = null;
    }
  }

  /**
   * My ハシゴテーブル要素を高解像度 PNG Blob として書き出す
   */
  async createPassBlob() {
    const area = document.getElementById('capture-area');
    if (!area) throw new Error('#capture-area が見つかりません');

    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        // フォント待機エラーは無視
      }
    }

    // 傾き・箔の光を外し、常に「正面から見た活版印刷」の状態で書き出す（以降の位置計測もこの平らな状態で行う）
    if (this._resetFoilTilt) this._resetFoilTilt();
    area.classList.add('is-capturing');
    this._drawPassFrame();

    // ロゴ・題字画像は foreignObject 内だと端末によって描かれないことがあるため、書き出し後に canvas へ直接描く
    const overlayImages = [
      { el: document.getElementById('modal-fes-logo'), src: this.logoDataUrl },
      { el: document.getElementById('pass-title-visual'), src: this.titleVisualDataUrl }
    ].filter(({ el, src }) => el && src && !el.classList.contains('hidden'));
    const areaRect = area.getBoundingClientRect();
    const overlays = overlayImages.map(({ el, src }) => {
      const r = el.getBoundingClientRect();
      return { el, src, x: r.left - areaRect.left, y: r.top - areaRect.top, w: r.width, h: r.height };
    }).filter(o => areaRect.width > 0 && o.w > 0 && o.h > 0);

    const targetHeight = area.scrollHeight;
    const targetWidth = area.offsetWidth;
    const prevMask = area.style.maskImage;
    const prevWebkitMask = area.style.webkitMaskImage;

    // SVG foreignObject 内の CSS mask-image は PNG 化時に黒抜きや透過欠損を招くため一時解除
    // （型抜きの形は書き出し後に canvas 上で切り抜く）
    area.style.maskImage = 'none';
    area.style.webkitMaskImage = 'none';
    overlays.forEach(({ el }) => { el.style.opacity = '0'; });

    try {
      const pixelRatio = 3;
      // 画面と同じ書体・同じ改行で書き出すため、使用文字だけのフォントを埋め込む（失敗時は従来どおり非埋め込み）
      let fontEmbedCSS = null;
      try {
        fontEmbedCSS = await this._buildSubsetFontCSS(area);
      } catch (e) {
        console.warn('Subset font embedding skipped:', e);
      }
      const paperColor = getComputedStyle(area).backgroundColor || '#ffffff';
      const canvas = await htmlToImage.toCanvas(area, {
        quality: 1.0,
        pixelRatio,
        cacheBust: true,
        skipFonts: !fontEmbedCSS,
        ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
        filter: (node) => {
          if (node instanceof Element) {
            if (node.classList.contains('hidden')) return false;
            if (node.tagName === 'IMG' && !node.getAttribute('src')) return false;
            // 箔の版（マスク使用）は書き出し時は光らないので含めない
            if (node.classList.contains('pass-frame') && node.classList.contains('is-foil')) return false;
          }
          return true;
        },
        backgroundColor: paperColor,
        width: targetWidth,
        height: targetHeight,
        style: {
          overflow: 'visible',
          maxHeight: 'none',
          height: `${targetHeight}px`,
          margin: '0',
          boxShadow: 'none'
        }
      });

      const ctx = canvas.getContext('2d');
      for (const overlay of overlays) {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (ctx) {
              ctx.drawImage(
                img,
                overlay.x * pixelRatio,
                overlay.y * pixelRatio,
                overlay.w * pixelRatio,
                overlay.h * pixelRatio
              );
            }
            resolve();
          };
          img.onerror = resolve;
          img.src = overlay.src;
        });
      }

      // 型抜き：四隅とミシン目の切り欠きを紙の外の色（画面の下地色）で抜く。
      // 透過のままだと、SNS 側で JPEG 化されたときに切り欠きが黒く潰れることがあるため塗っておく
      if (ctx && this._passShape && typeof Path2D !== 'undefined') {
        const surface = getComputedStyle(document.documentElement).getPropertyValue('--fes-surface').trim() || '#ffffff';
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.scale(canvas.width / this._passShape.w, canvas.height / this._passShape.h);
        ctx.fill(new Path2D(this._passShape.path));
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = surface;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 1.0);
      });

      if (!blob) throw new Error('PNG Blob の生成に失敗しました');
      return blob;
    } finally {
      area.style.maskImage = prevMask;
      area.style.webkitMaskImage = prevWebkitMask;
      area.classList.remove('is-capturing');
      overlays.forEach(({ el }) => { el.style.opacity = ''; });
    }
  }

  /**
   * 画像保存ボタン押下時の処理
   */
  async downloadImage(activeDay = 1) {
    if (this.isGenerating) return null;
    this.isGenerating = true;
    Analytics.track('save_image', { selectedIds: Array.from(this.selectedIds) });
    const labelEl = document.getElementById('download-btn-label');
    const prevText = labelEl ? labelEl.textContent : '画像を保存';
    if (labelEl) labelEl.textContent = '生成中...';

    try {
      const dayNum = this._parseDayNum(activeDay);
      const blob = await this.createPassBlob();
      const url = URL.createObjectURL(blob);

      if (this._isIOSDevice()) {
        this._showImageGuide(url, dayNum, 'save');
      } else {
        const host = document.querySelector('dialog[open]') || document.body;
        const a = document.createElement('a');
        a.href = url;
        a.download = `my_hashigo_table_day${dayNum}.png`;
        a.style.position = 'fixed';
        a.style.opacity = '0';
        host.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 4000);
      }

      if (labelEl) {
        labelEl.textContent = '保存完了';
        setTimeout(() => {
          labelEl.textContent = prevText;
        }, 1800);
      }
      return blob;
    } catch (e) {
      console.error('Pass image download failed:', e);
      if (labelEl) {
        labelEl.textContent = '生成失敗';
        setTimeout(() => {
          labelEl.textContent = prevText;
        }, 2000);
      }
      return null;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * SNSでシェアボタン押下時の処理
   */
  async shareImage(activeDay = 1) {
    if (this.isGenerating) return;
    this.isGenerating = true;
    Analytics.track('share_sns', { selectedIds: Array.from(this.selectedIds) });
    const labelEl = document.getElementById('share-btn-label');
    const prevText = labelEl ? labelEl.textContent : 'SNSでシェア';
    if (labelEl) labelEl.textContent = '準備中...';

    const title = this.config.title || 'タイムテーブル';
    const hashtag = this.config.hashtag || '';
    const customShare = this.config.shareText || `${title} のハシゴ予定を作成しました`;
    const shareUrl = Storage.encodeSharePlan(Array.from(this.selectedIds));
    const shareText = `${customShare} ${hashtag}`.trim();

    try {
      const dayNum = this._parseDayNum(activeDay);
      const blob = await this.createPassBlob();
      const file = new File([blob], `my_hashigo_table_day${dayNum}.png`, { type: 'image/png' });

      if (!this._isIOSDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: this.getPassHeading(),
          text: shareText,
          url: shareUrl
        });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        this._showImageGuide(blobUrl, dayNum, 'share', shareText, shareUrl);
      }
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        console.warn('Native share fallback:', e);
        const intentUrl = this._buildXIntentUrl(shareText, shareUrl);
        window.open(intentUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      if (labelEl) labelEl.textContent = prevText;
      this.isGenerating = false;
    }
  }

  _buildXIntentUrl(text, url) {
    const intent = new URL('https://twitter.com/intent/tweet');
    intent.searchParams.set('text', text);
    if (url) intent.searchParams.set('url', url);
    return intent.toString();
  }

  _showImageGuide(blobUrl, activeDay, mode, shareText = '', shareUrl = '') {
    const guide = document.getElementById('ios-share-guide');
    if (!guide) return;
    this._revokeGuideUrl();
    this._activeGuideUrl = blobUrl;

    const intentUrl = this._buildXIntentUrl(shareText, shareUrl);
    const caption = mode === 'save'
      ? '下の画像を長押しして「写真に保存」を選んでください。'
      : '下の画像を長押しで保存してから、X（Twitter）で画像付き投稿ができます。';

    const shareButtonHtml = mode === 'share'
      ? `<a href="${Parser.escapeHtml(intentUrl)}" target="_blank" rel="noopener noreferrer" class="ios-share-x-link">X（Twitter）を開いて投稿する</a>`
      : '';

    guide.innerHTML = `
      <div>${Parser.escapeHtml(caption)}</div>
      <img src="${Parser.escapeHtml(blobUrl)}" alt="My ハシゴテーブル DAY ${Number(activeDay)}">
      ${shareButtonHtml}
    `;
    guide.classList.remove('hidden');
  }
}
