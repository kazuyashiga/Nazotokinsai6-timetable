/**
 * 題字の後ろの「予定のコマ」：方眼のマスが 1〜4 マスぶん左から右へ塗られ、しばらくして消える。
 * - 文字の上には置かない（文字の範囲を測って避ける）
 * - 見出しが画面の外に出たら止める／「動きを減らす」設定・ヘッダー画像ありの時は出さない
 */
const CELL = 20;
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function textBoxes(header) {
  const hr = header.getBoundingClientRect();
  const out = [];
  header.querySelectorAll('.hero-kicker, .hero-title').forEach((el) => {
    if (!el.textContent.trim()) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    for (const b of r.getClientRects()) {
      out.push({ x: b.left - hr.left - 6, y: b.top - hr.top - 2, w: b.width + 12, h: b.height + 4 });
    }
  });
  return out;
}

export class HeroMotion {
  constructor(header) {
    this.header = header;
    this.layer = null;
    this.visible = true;
    this.lastW = 0;
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._apply(); });
    this.io.observe(header);
    this.ro = new ResizeObserver(() => {
      const w = header.offsetWidth;
      if (w === this.lastW) return;
      clearTimeout(this.rt);
      this.rt = setTimeout(() => this.start(), 160);
    });
    this.ro.observe(header);
    this.reduce.addEventListener?.('change', () => this.start());
  }

  /** 文字や設定が変わった時にも呼び直す */
  start() {
    this.stop();
    this.lastW = this.header.offsetWidth;
    if (this.reduce.matches || this.header.classList.contains('has-custom-bg')) return;

    this.layer = document.createElement('div');
    this.layer.className = 'hero-motion';
    this.layer.setAttribute('aria-hidden', 'true');
    this.header.prepend(this.layer);

    const W = this.header.clientWidth;
    const H = this.header.clientHeight;
    const cols = Math.floor(W / CELL);
    const rows = Math.ceil(H / CELL);
    const avoid = textBoxes(this.header);
    const n = Math.max(3, Math.min(12, Math.round(W / 100)));
    const live = new Map();

    const place = (el) => {
      live.delete(el);
      const taken = [...avoid, ...live.values()];
      let pick = null;
      for (let i = 0; i < 48 && !pick; i++) {
        // 2〜3 マスを出やすく、1 マスは余白が狭い画面の受け皿
        const span = [1, 2, 2, 3, 3, 4][Math.floor(Math.random() * 6)];
        if (span > cols) continue;
        const c = Math.floor(Math.random() * (cols - span + 1));
        const r = Math.floor(Math.random() * rows);
        const rect = { x: c * CELL, y: r * CELL, w: span * CELL, h: CELL };
        if (!taken.some((t) => hit(rect, t))) pick = rect;
      }
      if (!pick) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = '';
      // 方眼の線（1px）の内側に収める
      el.style.left = `${pick.x + 1}px`;
      el.style.top = `${pick.y + 1}px`;
      el.style.width = `${pick.w - 1}px`;
      live.set(el, pick);
    };

    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      el.className = 'hero-cell';
      const dur = 5200 + Math.random() * 2600;
      el.style.animationDuration = `${dur}ms`;
      el.style.animationDelay = `${Math.round((i * dur) / n)}ms`;
      el.addEventListener('animationiteration', () => place(el));
      this.layer.append(el);
      place(el);
    }
    this._apply();
  }

  stop() {
    if (this.layer) this.layer.remove();
    this.layer = null;
  }

  _apply() {
    if (this.layer) this.layer.classList.toggle('is-paused', !this.visible);
  }
}
