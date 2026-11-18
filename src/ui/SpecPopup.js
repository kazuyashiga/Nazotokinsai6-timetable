import { Parser } from '../core/Parser.js';

/**
 * 公演詳細（リング型）。
 * ポスターを真ん中に、左上=難易度・左下=所要時間と定員・右上=料金・右下=場所・下=タグを置く（見るだけ）。
 * 開く：列のポスターが中央へ飛ぶのと同時に、5 つがポスターの裏から約 90 度回りながら開き、ポスターが止まった少し後に開き終わる。
 * 背景のぼかしはリングより一回り大きいパネルだけ。パネルの外は表が見えたまま。
 * 閉じる：逆再生（輪が裏へ戻り、ポスターが列へ帰る）。×・ぼかしの所・パネルの外・Esc で閉じる。
 * パネルの外で別の公演のポスター／「詳細」を押したら、閉じる操作をはさまずにその公演へ切り替える。
 * 「動きを減らす」設定ではふわっと出し入れするだけ。
 */
const SIDE = 46;          // 左右の縦書きの欄の幅
const MAX_POSTER = 300;   // ポスターの幅の上限
const OPEN_MS = 340;      // ポスターのばねの動きの長さ（--ease-spring-soft：36% で着地し、行き過ぎは 55〜68% でほぼ収まる）
// 輪が開き終える時刻。ポスターが止まって見える頃（約 220ms）より少し後に終え、回る動きを目で追えるようにする。
// 300・340・420ms を実機で見比べて 340ms に決めた
const RING_MS = 340;
const PANEL_PAD = 14;     // ぼかしのパネルの、リングからの余白（左右・下）
const PANEL_TOP = 58;     // パネル上端の余白（× ボタンの分）

const esc = (s) => Parser.escapeHtml(String(s ?? ''));

/** 縦書き用：数字のカンマを外し、英数字は 2 字までを縦中横、3 字以上を 1 字ずつ縦に積む */
function verticalHtml(text) {
  return String(text ?? '')
    .replace(/(\d),(?=\d{3})/g, '$1')
    .split(/([0-9A-Za-z]+)/)
    .map((part, i) => {
      if (!part) return '';
      if (i % 2 === 0) return esc(part);
      return part.length <= 2 ? `<span class="ring-tcy">${esc(part)}</span>` : `<span class="ring-upr">${esc(part)}</span>`;
    })
    .join('');
}

const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export class SpecPopup {
  constructor() {
    this.showsById = new Map();
    this.state = 'closed';
    this.anims = [];
    this.src = null;
    this.invoker = null;
    this._bound = false;
    this._bind();
    this.spring = this._resolveSpring();
  }

  setShows(shows) {
    this.showsById = new Map((shows || []).map((s) => [s.id, s]));
  }

  _el(id) { return document.getElementById(id); }

  _prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** ばねの着地（linear() が使えない環境では普通の減速） */
  _resolveSpring() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--ease-spring-soft').trim();
    try {
      document.body.animate([{}, {}], { duration: 1, easing: v }).cancel();
      return v || 'cubic-bezier(0.24, 1, 0.4, 1)';
    } catch (_) {
      return 'cubic-bezier(0.24, 1, 0.4, 1)';
    }
  }

  _bind() {
    if (this._bound) return;
    const popover = this._el('spec-popover');
    const stage = this._el('pop-visual-stage');
    if (!popover || !stage) return;
    this._bound = true;

    // 傾けると光る（マウスは触れるだけ、指はなぞる）
    stage.addEventListener('pointerdown', (e) => {
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* 無視 */ }
      this.applyTiltAt(e.clientX, e.clientY);
    });
    stage.addEventListener('pointermove', (e) => this.applyTiltAt(e.clientX, e.clientY));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => stage.addEventListener(t, () => this.resetTilt()));

    this._el('spec-popover-close-btn')?.addEventListener('click', () => this.close());
    // ポスター・札・タグ・× 以外（ぼかしの所）を押したら閉じる
    popover.addEventListener('click', (e) => {
      if (e.target.closest('.ring-poster, .ring-slot, .ring-tag, .ring-close')) return;
      this.close();
    });
    // パネルの外（素通しの表）を押した時：別の公演のポスター／「詳細」なら、そのまま開き直す（openFrom が切り替える）。
    // それ以外なら閉じる。押した操作そのもの（スクロール・時間枠の選択など）は止めない
    document.addEventListener('pointerdown', (e) => {
      if (this.state === 'closed' || this.state === 'closing') return;
      if (e.target.closest('#spec-popover .ring-bg, #spec-popover .ring-layout, #spec-popover .ring-close')) return;
      if (e.target.closest('.visual-tap-btn, .spec-pill-btn')) return;
      this.close();
    }, true);
    // Esc も × と同じく逆再生で閉じる（既定の「即座に閉じる」を止める）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.state === 'closed') return;
      e.preventDefault();
      this.close();
    }, true);
    // スマホの「戻る」などで直接閉じられた時の後片付け
    popover.addEventListener('toggle', (e) => {
      if (e.newState !== 'closed' || this.state === 'closed' || popover.matches(':popover-open')) return;
      this._cleanup();
      this.invoker?.focus({ preventScroll: true });
    });
    window.addEventListener('resize', () => { if (this.state === 'open') this._sizeLayout(); });
  }

  /**
   * 指定座標に応じて3Dチルト角・グレア位置を更新
   */
  applyTiltAt(clientX, clientY) {
    if (this._prefersReducedMotion() || this.state !== 'open') return;
    const stage = this._el('pop-visual-stage');
    const card = this._el('pop-visual-card');
    if (!stage || !card) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = Math.max(-0.5, Math.min(0.5, (clientX - rect.left) / rect.width - 0.5));
    const relY = Math.max(-0.5, Math.min(0.5, (clientY - rect.top) / rect.height - 0.5));
    const maxDeg = 14;
    card.classList.add('is-tilting');
    card.style.setProperty('--tilt-rx', `${(-relY * 2 * maxDeg).toFixed(2)}deg`);
    card.style.setProperty('--tilt-ry', `${(relX * 2 * maxDeg).toFixed(2)}deg`);
    card.style.setProperty('--tilt-scale', '1.025');
    card.style.setProperty('--glare-x', `${((relX + 0.5) * 100).toFixed(1)}%`);
    card.style.setProperty('--glare-y', `${((relY + 0.5) * 100).toFixed(1)}%`);
    card.style.setProperty('--glare-opacity', '0.9');
  }

  /** 3Dチルトとグレアを滑らかにニュートラル状態へ戻す */
  resetTilt() {
    const card = this._el('pop-visual-card');
    if (!card) return;
    card.classList.remove('is-tilting');
    card.style.setProperty('--tilt-rx', '0deg');
    card.style.setProperty('--tilt-ry', '0deg');
    card.style.setProperty('--tilt-scale', '1');
    card.style.setProperty('--glare-x', '50%');
    card.style.setProperty('--glare-y', '50%');
    card.style.setProperty('--glare-opacity', '0');
  }

  _formatFee(feeVal) {
    const raw = String(feeVal ?? '').trim();
    if (!raw) return '未定';
    if (/^\d+$/.test(raw)) return `${Number(raw).toLocaleString('ja-JP')}円`;
    return raw;
  }

  _difficultyHtml(show) {
    const d = show.difficulty;
    const gauge = (n) => `<span class="ring-gauge" aria-hidden="true">${
      Array.from({ length: 10 }, (_, k) => `<i class="${n !== null && k < n ? 'is-on' : ''}"></i>`).join('')
    }</span>`;
    if (d && d.isNumeric) {
      const n = Math.max(0, Math.min(10, Number(d.value) || 0));
      const numHtml = n >= 10 ? `<span class="ring-tcy">${n}</span>` : String(n);
      return `<span class="ring-diff-num">${numHtml}</span><span class="ring-diff-max">／<span class="ring-tcy">10</span></span>${gauge(n)}`;
    }
    const text = d ? String(d.displayText || '').trim() : '';
    if (!text || /^[-ー—―]$/.test(text) || text === '未定') return `<span class="ring-diff-num">—</span>${gauge(null)}`;
    return verticalHtml(text);
  }

  /** 中身を入れる（ポスター・ぼかし・5つの札） */
  prepare(showId) {
    const show = this.showsById.get(showId);
    if (!show) return false;
    this.resetTilt();

    const fullUrl = Parser.convertDriveUrl(show.visualUrl || show.visualThumbnail || '');
    const thumbUrl = Parser.convertDriveUrl(show.visualThumbnail || show.visualUrl || '', true) || fullUrl;
    const bgUrl = thumbUrl ? `url("${thumbUrl.replace(/"/g, '%22')}")` : 'none';
    const bgEl = this._el('pop-bg-blur');
    const fillEl = this._el('pop-visual-fill');
    if (bgEl) bgEl.style.backgroundImage = bgUrl;
    if (fillEl) fillEl.style.backgroundImage = bgUrl;
    this._renderVisual(show, thumbUrl, fullUrl);

    const durText = show.displayDuration || (show.durationMin ? `${show.durationMin}分` : '');
    const cap = show.capacity && show.capacity !== '-' ? show.capacity : '';
    const durCap = [durText, cap].filter(Boolean).join('／');

    const set = (id, html) => { const el = this._el(id); if (el) el.innerHTML = html; };
    set('pop-diff', this._difficultyHtml(show));
    set('pop-dur', durCap ? verticalHtml(durCap) : '—');
    set('pop-fee', verticalHtml(this._formatFee(show.fee)));
    set('pop-room', verticalHtml(show.room || '未定'));
    const tags = show.tags && show.tags.length ? show.tags : [];
    set('pop-tags', tags.map((t) => `<span class="ring-tag">${esc(t)}</span>`).join(''));
    return true;
  }

  /** まず列で読み込み済みの軽いサムネイルを出し、高画質版が読めたら差し替える */
  _renderVisual(show, thumbUrl, fullUrl) {
    const contentEl = this._el('pop-visual-content');
    if (!contentEl) return;
    const token = Symbol(show.id);
    this._visualToken = token;
    contentEl.innerHTML = thumbUrl
      ? `<img src="${esc(thumbUrl)}" class="spec-tilt-img" alt="${esc(show.title)}">`
      : '';
    const imgEl = contentEl.querySelector('img');
    if (!imgEl || !fullUrl || thumbUrl === fullUrl) return;
    const hiRes = new Image();
    hiRes.decoding = 'async';
    hiRes.src = fullUrl;
    const swap = () => {
      // 別の公演を開き直していたら差し替えない
      if (this._visualToken === token && imgEl.isConnected) imgEl.src = fullUrl;
    };
    if (typeof hiRes.decode === 'function') hiRes.decode().then(swap).catch(() => {});
    else hiRes.addEventListener('load', swap, { once: true });
  }

  /** ポスターの大きさ：幅は画面幅から、上限は画面の高さから。縦書きの札は入りきらない時だけ文字を小さく */
  _sizeLayout() {
    const layout = this._el('ring-layout');
    if (!layout) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let pw = Math.min(MAX_POSTER, vw - 16 - 2 * (SIDE + 8));
    const apply = () => {
      layout.style.setProperty('--side', `${SIDE}px`);
      layout.style.setProperty('--pw', `${Math.round(pw)}px`);
      layout.style.setProperty('--ph', `${Math.round((pw * 424) / 300)}px`);
    };
    apply();
    const tagsH = this._el('pop-tags')?.offsetHeight || 0;
    const maxPh = vh - 56 - 24 - 18 - tagsH - 16;
    if ((pw * 424) / 300 > maxPh) { pw = Math.max(120, (maxPh * 300) / 424); apply(); }
    layout.querySelectorAll('.ring-slot-value:not(.is-diff)').forEach((v) => {
      v.style.fontSize = '';
      let fs = 18;
      while (fs > 12 && v.getBoundingClientRect().width > fs * 1.6) { fs -= 1; v.style.fontSize = `${fs}px`; }
    });
    // ぼかしのパネル：リング（ポスター・左右の札・タグ）の実寸より一回り大きく
    const popover = this._el('spec-popover');
    const r = layout.getBoundingClientRect();
    const x = Math.max(4, r.left - PANEL_PAD);
    const y = Math.max(4, r.top - PANEL_TOP);
    const w = Math.min(vw - 4, r.right + PANEL_PAD) - x;
    const h = Math.min(vh - 4, r.bottom + PANEL_PAD) - y;
    popover.style.setProperty('--panel-x', `${Math.round(x)}px`);
    popover.style.setProperty('--panel-y', `${Math.round(y)}px`);
    popover.style.setProperty('--panel-w', `${Math.round(w)}px`);
    popover.style.setProperty('--panel-h', `${Math.round(h)}px`);
  }

  _ringItems() {
    return [...document.querySelectorAll('#ring-layout .ring-slot'), this._el('pop-tags')].filter(Boolean);
  }

  /** 輪：最終位置から約 90 度手前・半径 0（ポスターの裏）から、回りながら外へ */
  _spiralFrames(el, pc, forward) {
    const c = centerOf(el.getBoundingClientRect());
    const vx = c.x - pc.x;
    const vy = c.y - pc.y;
    const frames = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const e = 1 - Math.pow(1 - t, 3);
      const th = -(Math.PI / 2) * (1 - e);
      const rx = (vx * Math.cos(th) - vy * Math.sin(th)) * e;
      const ry = (vx * Math.sin(th) + vy * Math.cos(th)) * e;
      frames.push({ transform: `translate(${rx - vx}px, ${ry - vy}px) scale(${0.6 + 0.4 * e})`, opacity: Math.min(1, t * 3.2) });
    }
    return forward ? frames : frames.reverse();
  }

  _flipFrom(srcRect, dstRect) {
    return `translate(${srcRect.left - dstRect.left}px, ${srcRect.top - dstRect.top}px) scale(${srcRect.width / dstRect.width})`;
  }

  /**
   * 列のメインビジュアル／「詳細」ボタンから開く
   * @param {string} showId
   * @param {HTMLElement} invoker タップされたボタン（閉じた後のフォーカス戻り先）
   */
  openFrom(showId, invoker) {
    const popover = this._el('spec-popover');
    if (!popover) return;
    // 開いている間に別の公演が押されたら、閉じる動きを待たずに切り替える
    if (this.state !== 'closed') {
      if (popover.matches(':popover-open')) popover.hidePopover();
      this._cleanup();
    }
    if (!this.prepare(showId)) return;
    if (typeof popover.showPopover !== 'function') return;

    this.invoker = invoker || null;
    this.src = invoker?.closest('.col-header')?.querySelector('.program-visual') || null;
    popover.showPopover();
    this._sizeLayout();
    this.state = 'opening';
    this._el('spec-popover-close-btn')?.focus({ preventScroll: true });

    const done = (anims) => Promise.all(anims.map((a) => a.finished))
      .then(() => { if (this.state === 'opening') this.state = 'open'; })
      .catch(() => {});

    if (this._prefersReducedMotion()) {
      this.anims = [popover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })];
      done(this.anims);
      return;
    }

    const posterBox = this._el('pop-visual-stage');
    const card = this._el('pop-visual-card');
    const bg = popover.querySelector('.ring-bg');
    const closeBtn = this._el('spec-popover-close-btn');
    const dst = card.getBoundingClientRect();
    const anims = [];
    if (this.src) {
      const srcRect = this.src.getBoundingClientRect();
      this.src.style.visibility = 'hidden';
      posterBox.style.transformOrigin = '0 0';
      anims.push(posterBox.animate([{ transform: this._flipFrom(srcRect, dst) }, { transform: 'none' }], { duration: OPEN_MS, easing: this.spring }));
    } else {
      anims.push(posterBox.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' }));
    }
    anims.push(bg.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: OPEN_MS, easing: this.spring }));
    anims.push(closeBtn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay: RING_MS - 140, fill: 'backwards' }));
    // 輪はポスターと同時に回し始め、ポスターが止まった少し後（RING_MS）に開き終える。
    // 少しずつ遅らせて出す分は、その分だけ短くして終わりを揃える
    const pc = centerOf(dst);
    const STAGGER = 14;
    this._ringItems().forEach((el, k) => {
      anims.push(el.animate(this._spiralFrames(el, pc, true), { duration: RING_MS - k * STAGGER, delay: k * STAGGER, easing: 'linear', fill: 'backwards' }));
    });
    this.anims = anims;
    done(anims);
  }

  close() {
    const popover = this._el('spec-popover');
    if (!popover || this.state === 'closed' || this.state === 'closing') return;
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    this.state = 'closing';
    this.resetTilt();

    const finish = () => {
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      if (popover.matches(':popover-open')) popover.hidePopover();
      this._cleanup();
      this.invoker?.focus({ preventScroll: true });
    };

    if (this._prefersReducedMotion()) {
      this.anims = [popover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' })];
      this.anims[0].finished.then(finish).catch(() => {});
      return;
    }

    const posterBox = this._el('pop-visual-stage');
    const card = this._el('pop-visual-card');
    const bg = popover.querySelector('.ring-bg');
    const closeBtn = this._el('spec-popover-close-btn');
    const dst = card.getBoundingClientRect();
    const items = this._ringItems();
    const pc = centerOf(dst);
    const anims = [];
    items.forEach((el, k) => {
      anims.push(el.animate(this._spiralFrames(el, pc, false), { duration: 240, delay: (items.length - 1 - k) * 25, easing: 'linear', fill: 'forwards' }));
    });
    anims.push(closeBtn.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
    if (this.src && this.src.isConnected) {
      const srcRect = this.src.getBoundingClientRect();
      posterBox.style.transformOrigin = '0 0';
      anims.push(posterBox.animate([{ transform: 'none' }, { transform: this._flipFrom(srcRect, dst) }], { duration: 260, delay: 100, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' }));
    } else {
      anims.push(posterBox.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 100, fill: 'forwards' }));
    }
    anims.push(bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 100, easing: 'ease-in', fill: 'forwards' }));
    this.anims = anims;
    Promise.all(anims.map((a) => a.finished)).then(finish).catch(() => {});
  }

  /** どの閉じ方でも最後に呼ぶ：列のポスターを戻し、動きを片付ける */
  _cleanup() {
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    if (this.src) this.src.style.visibility = '';
    this.src = null;
    this.resetTilt();
    this.state = 'closed';
  }
}
