/**
 * 会場内・会場間の移動ルートを、フロアマップ（と建物の外の周辺地図）の上にモーショングラフィックで示す全画面ビュー。
 *
 * 層の構成（ステージの中）
 *   - 地図の層（.rv-map ×2）：フロアの画像を「地図の座標」で置き、カメラ（拡大・回転・移動）をかける。
 *     2 枚あるのは、階を入れ替えるため。
 *       屋内 ⇔ 屋内：上下のスライド＋フェード（ズームはしない）
 *       屋内 ⇔ 屋外：ズームアウト／ズームイン。屋内図が周辺地図の建物の形（footprint）へ縮みながら回る（docs/OUTDOOR_ROUTE.md）
 *   - 線の層（.rv-overlay の SVG）：ルートの線・光の帯・山形の矢印・歩く点を「画面の座標」で描く。
 *     カメラが動くたびに点列を画面座標へ写して描き直すので、拡大しても線の太さと矢印の間隔は一定。
 *   - 札の層（.rv-pins）：出発の輪・到着のピン・階段の番号札を画面座標の HTML で置く（常に読める大きさ）。
 *
 * 判定はしない（主催者の設定を覆さないため）。建物の外を通るときだけ、目安の「徒歩約N分」を出す。
 */
import { Parser } from '../core/Parser.js';
import { closeTopLayer } from './motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_ZOOM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20M10.5 7.5v6M7.5 10.5h6"/></svg>';
const ICON_FIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_STAIRS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h5v-5h5v-5h5V5h3"/></svg>';
const ICON_DOOR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4.5L14 3v18"/><path d="M14 5h4v16"/><path d="M3 21h18"/><path d="M11 12.5v.5"/></svg>';
const ICON_WALK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 3v3"/><path d="M7 11l3-3h4l2 4 3 1"/><path d="M10 8l1 7"/></svg>';
const ICON_PREV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_NEXT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

const reduceMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────── 補間・幾何 ─────────── */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** ばね（行き過ぎ少し）：小さな札・ピンの着地用 */
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** 大きな面（カメラ）用：素早く寄せて静かに止まる */
const easeCamera = (t) => 1 - Math.pow(1 - t, 4);
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };

/* ─────────── 2 次元のアフィン変換（SVG の matrix(a b c d e f)：x' = a x + c y + e, y' = b x + d y + f） ─────────── */
const DEG = Math.PI / 180;
/** カメラ { s, r(度), tx, ty } → 行列 */
const camMatrix = ({ s, r = 0, tx, ty }) => {
  const c = Math.cos(r * DEG) * s;
  const n = Math.sin(r * DEG) * s;
  return [c, n, -n, c, tx, ty];
};
/** m1 ∘ m2（m2 を先にかける） */
const mul = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
/**
 * 屋内図 → 周辺地図の行列。footprint の outline（屋内図の外形の四角）を、center を中心に size の大きさで rotation 度回して置く。
 * u = 0 では縦横の縮尺をそろえ（屋内図をゆがめない）、u = 1 で建物の形にぴったり合わせる（ズームの間に少しずつ）
 */
function footprintMatrix(fp, u = 1) {
  const [x0, y0, x1, y1] = fp.outline;
  const sx = fp.size[0] / (x1 - x0);
  const sy = fp.size[1] / (y1 - y0);
  const k = Math.sqrt(sx * sy);
  const ex = k + (sx - k) * u;
  const ey = k + (sy - k) * u;
  const c = Math.cos(fp.rotation * DEG);
  const n = Math.sin(fp.rotation * DEG);
  const a = c * ex; const b = n * ex; const cc = -n * ey; const d = c * ey;
  const fx = (x0 + x1) / 2; const fy = (y0 + y1) / 2;
  return [a, b, cc, d, fp.center[0] - (a * fx + cc * fy), fp.center[1] - (b * fx + d * fy)];
}
const footprintScale = (fp) => {
  const [x0, y0, x1, y1] = fp.outline;
  return Math.sqrt((fp.size[0] / (x1 - x0)) * (fp.size[1] / (y1 - y0)));
};

/** 角を丸めた折れ線のパス（画面座標） */
function roundedPath(pts, r = 14) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) {
      d += ` L${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
      continue;
    }
    const a = { x: p1.x - ((p1.x - p0.x) / l1) * rr, y: p1.y - ((p1.y - p0.y) / l1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * rr, y: p1.y + ((p2.y - p1.y) / l2) * rr };
    d += ` L${a.x.toFixed(1)},${a.y.toFixed(1)} Q${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/**
 * 1 つのフロアの地図の層。カメラ（s, tx, ty）で地図座標 → 画面座標へ写す。
 */
class MapLayer {
  constructor(stage) {
    this.root = el('div', 'rv-map');
    this.svg = svgEl('svg', { class: 'rv-map-svg', 'aria-hidden': 'true' });
    this.cam = svgEl('g');
    this.img = svgEl('image', { preserveAspectRatio: 'none' });
    this.cam.appendChild(this.img);
    this.svg.appendChild(this.cam);
    this.root.appendChild(this.svg);
    stage.appendChild(this.root);
    this.floor = null;
    this.camera = { s: 1, r: 0, tx: 0, ty: 0 };
    this.matrix = camMatrix(this.camera);
  }
  setFloor(floor) {
    if (this.floor === floor) return;
    this.floor = floor;
    this.img.setAttribute('href', floor.image || '');
    this.img.setAttribute('width', floor.width || 1200);
    this.img.setAttribute('height', floor.height || 800);
  }
  setCamera(c) {
    this.camera = { r: 0, ...c };
    this._apply(camMatrix(this.camera));
  }
  /** ズームの間だけ：周辺地図のカメラに建物の位置を重ねた行列で置く（屋内図を周辺地図に貼り付ける） */
  setMatrix(m) {
    this._apply(m);
  }
  _apply(m) {
    this.matrix = m;
    this.cam.setAttribute('transform', `matrix(${m.map((v) => v.toFixed(5)).join(' ')})`);
  }
  toScreen(p) {
    const m = this.matrix;
    return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
  }
}

/**
 * 出る所の札：「南階段で1階へ」「正面入口から外へ」「別館 入口から1階へ」
 * through（種類の違うもう一方）があるとき：「エレベーターで降り、1階 出入口から外へ」「1階 出入口から入り、エレベーターで5階へ」
 */
function exitLabel(v) {
  if (v.kind === 'entrance' && v.through) {
    return v.toFloor.outdoor ? `${v.name}で降り、${v.through}から外へ` : `${v.name}から入り、${v.through}で${v.toFloor.label}へ`;
  }
  if (v.kind === 'entrance') return v.toFloor.outdoor ? `${v.name}から外へ` : `${v.name}から${v.toFloor.label}へ`;
  return `${v.name}で${v.toFloor.label}へ`;
}
/** 着いた所の札：「南階段から1階に到着」「本館 正面入口から外へ」「正面入口から1階に入る」「エレベーターで5階に到着」 */
function enterLabel(seg) {
  const v = seg.enterVia;
  if (v.kind === 'entrance' && seg.floor.outdoor) return `${v.name}から外へ`;
  if (v.kind === 'entrance' && !v.through) return `${v.name}から${seg.floor.label}に入る`;
  if (v.kind === 'entrance') return `${v.name}で${seg.floor.label}に到着`;
  return `${v.name}から${seg.floor.label}に到着`;
}

export class RouteView {
  constructor() {
    this.router = null;
    this.steps = [];
    this.index = 0;
    this._raf = 0;
    this._timeline = [];
    this._build();
  }

  /* ─────────── DOM ─────────── */
  _build() {
    const d = el('dialog', 'route-dialog');
    d.setAttribute('aria-labelledby', 'rv-title');
    d.innerHTML = `
      <div class="rv-shell">
        <header class="rv-head">
          <div class="rv-head-row">
            <p class="rv-kicker" id="rv-title">会場内のルート</p>
            <span class="rv-walk" hidden></span>
            <button type="button" class="rv-icon-btn rv-close" aria-label="ルート案内を閉じる">${ICON_CLOSE}</button>
          </div>
          <div class="rv-legline">
            <span class="rv-room rv-room-from"></span>
            <span class="rv-legarrow" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="rv-room rv-room-to"></span>
          </div>
          <p class="rv-next-show"></p>
          <ol class="rv-rail" aria-label="通る階"></ol>
        </header>
        <div class="rv-stage" role="img" aria-label="フロアマップと移動ルート">
          <svg class="rv-overlay" aria-hidden="true"></svg>
          <div class="rv-pins" aria-hidden="true"></div>
          <p class="rv-credit" hidden></p>
          <button type="button" class="rv-icon-btn rv-fit"></button>
        </div>
        <footer class="rv-foot">
          <div class="rv-instruction" aria-live="polite"></div>
          <div class="rv-nav">
            <button type="button" class="rv-nav-btn rv-prev">${ICON_PREV}<span>前へ</span></button>
            <div class="rv-dots" aria-hidden="true"></div>
            <button type="button" class="rv-nav-btn rv-next is-primary"><span>次へ</span>${ICON_NEXT}</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(d);
    this.dialog = d;
    this.stage = d.querySelector('.rv-stage');
    this.layers = [new MapLayer(this.stage), new MapLayer(this.stage)];
    // 地図の層は線・札より奥
    this.layers.forEach((l) => this.stage.insertBefore(l.root, this.stage.firstChild));
    this.front = 0;
    this.overlay = d.querySelector('.rv-overlay');
    this.pins = d.querySelector('.rv-pins');

    // 線の層：下地（太い影）→ 本線 → 光の帯 → 山形の矢印 → 歩く点
    this.gHalo = svgEl('path', { class: 'rv-route-halo' });
    this.gBase = svgEl('path', { class: 'rv-route-base' });
    this.gFlow = svgEl('path', { class: 'rv-route-flow' });
    this.gChevrons = svgEl('g', { class: 'rv-chevrons' });
    this.gWalker = svgEl('g', { class: 'rv-walker' });
    this.gWalker.append(svgEl('circle', { r: 16, class: 'rv-walker-glow' }), svgEl('circle', { r: 7, class: 'rv-walker-core' }));
    this.gComet = svgEl('g', { class: 'rv-comet' });
    this.gComet.append(svgEl('circle', { r: 22, class: 'rv-comet-glow' }), svgEl('circle', { r: 8, class: 'rv-comet-core' }));
    this.overlay.append(this.gHalo, this.gBase, this.gFlow, this.gChevrons, this.gWalker, this.gComet);
    this.measure = svgEl('path');
    this.measure.style.visibility = 'hidden';
    this.overlay.appendChild(this.measure);

    d.querySelector('.rv-close').addEventListener('click', () => this.close());
    d.querySelector('.rv-prev').addEventListener('click', () => this.go(this.index - 1));
    d.querySelector('.rv-next').addEventListener('click', () => {
      if (this.index < this.steps.length - 1) this.go(this.index + 1);
      else this.close();
    });
    // 表示の切り替え：「全体」（階全体を俯瞰）⇔「拡大」（ルートの所だけ）。押すたびに入れ替わり、次の区間でもそのまま
    this.fitBtn = d.querySelector('.rv-fit');
    this.fitBtn.addEventListener('click', () => {
      this.viewMode = this.viewMode === 'floor' ? 'route' : 'floor';
      this._renderFitBtn();
      this.userCamera = false;
      this._flyTo(this._targetCamera(this.steps[this.index]), 600);
    });
    d.addEventListener('close', () => this._stop());
    d.addEventListener('click', (e) => { if (e.target === d) this.close(); });
    this._bindGestures();
    // 地図の枠の大きさは、画面の回転だけでなく見出しの行数（部屋名の長さ）でも変わる。枠そのものを見張る
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { if (d.open) this._onResize(); }).observe(this.stage);
    } else {
      window.addEventListener('resize', () => { if (d.open) this._onResize(); });
    }
  }

  /* ─────────── 公開 API ─────────── */

  /**
   * @param {import('../core/VenueRouter.js').VenueRouter} router
   * @param {Array<{ from: string, to: string, nextShowLabel?: string }>} legs 部屋から部屋への移動（順番どおり）
   */
  open(router, legs) {
    this.router = router;
    this.steps = [];
    legs.forEach((leg, li) => {
      const r = router.route(leg.from, leg.to);
      if (!r) return;
      r.segments.forEach((seg, si) => {
        this.steps.push({ leg, li, route: r, seg, si, last: si === r.segments.length - 1 });
      });
    });
    if (!this.steps.length) return false;
    this.legCount = legs.length;
    this.index = 0;
    this.userCamera = false;
    // 最初は階全体の俯瞰（屋内はこの方が位置関係をつかみやすい）。巨大施設などは「拡大」でルートの所だけに寄る
    this.viewMode = 'floor';
    this._renderFitBtn();
    // 前回の表示の名残（切り替え途中の層・札）を消す
    this.slide = null;
    this.transit = null;
    this.pins.innerHTML = '';
    this.layers.forEach((l, k) => {
      l.root.style.transform = '';
      l.root.style.opacity = k === this.front ? 1 : 0;
      l.root.style.zIndex = k === this.front ? 2 : 1;
    });
    this._renderDots();
    if (!this.dialog.open) this.dialog.showModal();
    this._onResize();
    this._enterStep(0, { first: true });
    this._start();
    return true;
  }

  close() {
    closeTopLayer(this.dialog);
  }

  go(i) {
    if (i < 0 || i >= this.steps.length || i === this.index) return;
    const from = this.index;
    this.index = i;
    this.userCamera = false;
    this._enterStep(i, { backward: i < from });
  }

  /** 階の高さ（上下の向きを決める）。venue_map.json の level があればそれを、なければ ID・表示名の数字（B1 は -1）を使う */
  _floorLevel(floor) {
    if (Number.isFinite(floor.level)) return floor.level;
    const text = `${floor.id} ${floor.label}`;
    const b = text.match(/B\s*(\d+)/i);
    if (b) return -Number(b[1]);
    const n = text.match(/(\d+)/);
    return n ? Number(n[1]) : this.router.floors.indexOf(floor);
  }

  /* ─────────── 1 区間の入場 ─────────── */
  _enterStep(i, { first = false, backward = false } = {}) {
    const step = this.steps[i];
    const reduce = reduceMotion();
    // ズームの途中で「次へ」「前へ」を押されたら、ズームを終わった形にそろえてから次へ進む
    if (this.transit) this.transit.finish();
    this._gen = (this._gen || 0) + 1;
    this._timeline = [];
    this.drawP = reduce ? 1 : 0;
    this.flowOn = reduce;
    this.endP = reduce ? 1 : 0;
    this.startP = reduce ? 1 : 0;
    this.slide = null;
    this._renderHeader(step, backward);
    this._renderInstruction(step);
    // 地図の出典（OpenStreetMap など）。拡大しても見えるよう、地図の枠の隅に HTML で出す
    const credit = this.dialog.querySelector('.rv-credit');
    credit.textContent = step.seg.floor.attribution || '';
    credit.hidden = !step.seg.floor.attribution;
    this._updateNav();

    const curLayer = this.layers[this.front];
    const nextLayer = this.layers[1 - this.front];
    // 見出しを書き換えると地図の枠の高さが変わるので、測り直してから行き先を決める
    this._measure();
    const target = this._targetCamera(step);

    if (!first && curLayer.floor !== step.seg.floor && !reduce) {
      // ── 建物の外 ⇔ 中：周辺地図の上の建物の形へズームアウト／そこからズームイン ──
      const a = curLayer.floor;
      const b = step.seg.floor;
      if (a.footprint && a.footprint.floor === b.id) {
        this._zoomTransit('out', curLayer, nextLayer, step, target, a.footprint);
        return;
      }
      if (b.footprint && b.footprint.floor === a.id) {
        this._zoomTransit('in', curLayer, nextLayer, step, target, b.footprint);
        return;
      }
    }

    if (!first && curLayer.floor !== step.seg.floor) {
      // ── 階の移動：ズームはせず、上下のスライド＋フェードで「階が変わった」ことを示す ──
      // 屋外の地図との入れ替え（建物の位置が分からないとき）は、上下に動かさずフェードだけ
      // 上の階へ：新しい階は上から入り、旧の階は下へ抜ける（下の階へはその逆）
      nextLayer.setFloor(step.seg.floor);
      nextLayer.setCamera(target);
      this.front = 1 - this.front;
      nextLayer.root.style.zIndex = 2;
      curLayer.root.style.zIndex = 1;
      if (reduce) {
        nextLayer.root.style.opacity = 1;
        curLayer.root.style.opacity = 0;
        return;
      }
      const dir = this._floorLevel(step.seg.floor) > this._floorLevel(curLayer.floor) ? 1 : -1;
      const dist = (step.seg.floor.outdoor || curLayer.floor.outdoor) ? 0 : Math.min(96, this.H * 0.16);
      this._tween(380, easeOutCubic, (t) => {
        const yNew = -dir * (1 - t) * dist;
        nextLayer.root.style.transform = `translateY(${yNew.toFixed(1)}px)`;
        nextLayer.root.style.opacity = t.toFixed(3);
        curLayer.root.style.transform = `translateY(${(dir * t * dist).toFixed(1)}px)`;
        curLayer.root.style.opacity = (1 - t).toFixed(3);
        this.slide = { y: yNew, o: t };
      });
      this._at(390, () => {
        curLayer.root.style.transform = '';
        nextLayer.root.style.transform = '';
        this.slide = null;
      });
      this._playDraw(step, 260);
      return;
    }

    // 最初の区間・同じ階の続き
    if (first) {
      curLayer.setFloor(step.seg.floor);
      curLayer.root.style.opacity = 1;
      // 少し引いた位置から寄せる（開いた瞬間の印象づけ）
      curLayer.setCamera(reduce ? target : { s: target.s * 0.82, tx: target.tx + this.W * 0.09, ty: target.ty + this.H * 0.09 });
      if (!reduce) this._flyTo(target, 620);
    } else if (reduce) {
      curLayer.setCamera(target);
    } else {
      this._flyTo(target, 520);
    }
    if (!reduce) this._playDraw(step, first ? 260 : 160);
  }

  /** 出発の輪 → 線を描く（光の頭つき）→ 到着のピンが落ちる → 流れ始める（線の伸びは 0.5 秒で軽快に） */
  _playDraw(step, delay) {
    this.startP = 0;
    this.drawP = 0;
    this.endP = 0;
    this._tween(300, (t) => t, (t) => { this.startP = t; }, delay);
    this._tween(525, easeInOutCubic, (t) => { this.drawP = t; }, delay + 120);
    this._tween(420, (t) => t, (t) => { this.endP = t; }, delay + 560);
    this._at(delay + 640, () => { this.flowOn = true; this.flowT0 = performance.now(); });
    // 階段で終わる区間でも、次の階へは自動で進まない。利用者が階段を移動し終えて「○階へ」を押した時に切り替える
  }

  /**
   * 屋内 ⇔ 屋外のズーム。周辺地図（O）のカメラを動かし、屋内図（I）は O のカメラに footprint を重ねた行列で貼り付ける。
   *   out：今の屋内の見た目とぴったり重なる O のカメラ（回転つき）から、O の行き先（北が上）へ引く。屋内図は建物の形へ縮み、消える
   *   in ：O の今の見た目から、屋内の行き先と重なる O のカメラへ寄る。屋内図は建物の形から広がって現れる
   * 線と札は、ズームが終わってから描く
   */
  _zoomTransit(dir, curLayer, nextLayer, step, target, fp) {
    const out = dir === 'out';
    const indoor = out ? curLayer : nextLayer;
    const outdoor = out ? nextLayer : curLayer;
    const fpS = footprintScale(fp);
    /** 屋内のカメラ（回転なし）と、見た目がぴったり重なる O のカメラ */
    const matched = (ci) => {
      const r = -fp.rotation;
      const s = ci.s / fpS;
      const fx = (fp.outline[0] + fp.outline[2]) / 2;
      const fy = (fp.outline[1] + fp.outline[3]) / 2;
      // tO = tI + sI·Fc − sO·R(r)·C
      const c = Math.cos(r * DEG); const n = Math.sin(r * DEG);
      const rcx = c * fp.center[0] - n * fp.center[1];
      const rcy = n * fp.center[0] + c * fp.center[1];
      return { s, r, tx: ci.tx + ci.s * fx - s * rcx, ty: ci.ty + ci.s * fy - s * rcy };
    };
    const camFrom = out ? matched(curLayer.camera) : { ...outdoor.camera };
    const camTo = out ? target : matched(target);
    nextLayer.setFloor(step.seg.floor);
    indoor.root.style.zIndex = 2;
    outdoor.root.style.zIndex = 1;
    indoor.root.style.transform = '';
    outdoor.root.style.transform = '';
    this.front = this.layers.indexOf(nextLayer);
    const ms = out ? 1150 : 1050;
    const frame = (t) => {
      const e = easeInOutCubic(t);
      // 建物（footprint の中心）が画面の上をなめらかに動くように補間する（画面の中央を基準にすると、
      // 建物が全体表示の端にあるとき、ズームの途中で建物が画面の外へ出てしまう）
      const camO = this._lerpCamRot(camFrom, camTo, e, { x: fp.center[0], y: fp.center[1] });
      outdoor.setCamera(camO);
      // out：u 0→1（屋内図の縦横を建物の形へ）／ in：u 1→0
      indoor.setMatrix(mul(camMatrix(camO), footprintMatrix(fp, out ? e : 1 - e)));
      if (out) {
        outdoor.root.style.opacity = smooth(0, 0.22, t).toFixed(3);
        indoor.root.style.opacity = (1 - smooth(0.5, 0.92, t)).toFixed(3);
      } else {
        outdoor.root.style.opacity = '1';
        indoor.root.style.opacity = smooth(0.12, 0.58, t).toFixed(3);
      }
    };
    const finish = () => {
      if (this.transit !== tr) return;
      this.transit = null;
      if (out) {
        outdoor.setCamera(target);
        outdoor.root.style.opacity = '1';
        indoor.root.style.opacity = '0';
      } else {
        indoor.setCamera(target);
        indoor.root.style.opacity = '1';
        outdoor.root.style.opacity = '0';
        outdoor.setCamera({ ...outdoor.camera, r: 0 });
      }
    };
    const tr = { finish };
    this.transit = tr;
    frame(0);
    this._tween(ms, (t) => t, frame);
    this._at(ms + 10, () => {
      finish();
      this._playDraw(step, 40);
    });
  }

  /* ─────────── カメラ ─────────── */
  /** ボタンは「押すと次にどうなるか」を示す：俯瞰中は「拡大」、拡大中は「全体」 */
  _renderFitBtn() {
    const zoomNext = this.viewMode === 'floor';
    this.fitBtn.innerHTML = zoomNext ? `${ICON_ZOOM}<span>拡大</span>` : `${ICON_FIT}<span>全体</span>`;
    this.fitBtn.setAttribute('aria-label', zoomNext ? 'ルートの所を拡大して表示' : '階全体を表示');
  }

  _targetCamera(step) {
    return this.viewMode === 'route' ? this._fitCamera(step) : this._fitFloor(step);
  }

  /**
   * 階全体が収まる位置（上の札・下のボタンにかからない余白をとる）。
   * 周辺地図のように広い図は、floor.focus（[x0, y0, x1, y1]：会場のあたり）を全体として見せる
   */
  _fitFloor(step) {
    const f = step.seg.floor;
    const [x0, y0, x1, y1] = Array.isArray(f.focus) && f.focus.length === 4 ? f.focus : [0, 0, f.width || 1200, f.height || 800];
    const fw = x1 - x0;
    const fh = y1 - y0;
    const padX = 14; const padTop = 64; const padBottom = 58;
    const s = Math.min((this.W - padX * 2) / fw, (this.H - padTop - padBottom) / fh);
    return { s, tx: (this.W - fw * s) / 2 - x0 * s, ty: padTop + (this.H - padTop - padBottom - fh * s) / 2 - y0 * s };
  }

  /** ルートの区間に寄せた位置 */
  _fitCamera(step) {
    const pts = step.seg.points;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const fw = step.seg.floor.width || 1200;
    const fh = step.seg.floor.height || 800;
    // 区間が細長くても周りの部屋が見えるよう、最低限の広さを確保する
    const minSpan = Math.min(fw, fh) * 0.42;
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    const bw = Math.max(x1 - x0, minSpan); const bh = Math.max(y1 - y0, minSpan);
    const padX = 34; const padTop = 70; const padBottom = 56;
    const s = Math.min((this.W - padX * 2) / bw, (this.H - padTop - padBottom) / bh, 3);
    const sFloor = Math.min(this.W / fw, this.H / fh) * 0.92;
    const sc = Math.max(s, sFloor);
    return { s: sc, tx: this.W / 2 - cx * sc, ty: padTop + (this.H - padTop - padBottom) / 2 - cy * sc };
  }

  _lerpCam(a, b, t) {
    // 拡大率は対数で補間すると寄りと引きの速さが自然になる
    const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t);
    return { s, tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t };
  }

  /**
   * 回転つきのカメラの補間。拡大率（対数）と回転をなめらかに移す。
   * anchor（地図上の点）があれば、その点の画面上の位置を始まりから終わりへまっすぐ動かす（その点は画面から消えない）。
   * 無ければ、画面の中央に見えている地図上の点を移す
   */
  _lerpCamRot(a, b, t, anchor = null) {
    const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t);
    let dr = (b.r || 0) - (a.r || 0);
    dr -= Math.round(dr / 360) * 360;
    const r = (a.r || 0) + dr * t;
    const c = Math.cos(r * DEG) * s;
    const n = Math.sin(r * DEG) * s;
    if (anchor) {
      const at = (cam) => { const m = camMatrix(cam); return { x: m[0] * anchor.x + m[2] * anchor.y + m[4], y: m[1] * anchor.x + m[3] * anchor.y + m[5] }; };
      const pa = at(a);
      const pb = at(b);
      const P = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
      return { s, r, tx: P.x - (c * anchor.x - n * anchor.y), ty: P.y - (n * anchor.x + c * anchor.y) };
    }
    const P = { x: this.W / 2, y: this.H / 2 };
    const focus = (cam) => {
      const rr = -(cam.r || 0) * DEG;
      const x = (P.x - cam.tx) / cam.s;
      const y = (P.y - cam.ty) / cam.s;
      return { x: Math.cos(rr) * x - Math.sin(rr) * y, y: Math.sin(rr) * x + Math.cos(rr) * y };
    };
    const fa = focus(a);
    const fb = focus(b);
    const q = { x: fa.x + (fb.x - fa.x) * t, y: fa.y + (fb.y - fa.y) * t };
    return { s, r, tx: P.x - (c * q.x - n * q.y), ty: P.y - (n * q.x + c * q.y) };
  }

  _flyTo(target, ms) {
    const layer = this.layers[this.front];
    const from = { ...layer.camera };
    this.activeLayer = layer;
    if (!ms || reduceMotion()) {
      layer.setCamera(target);
      return;
    }
    this._tween(ms, easeCamera, (t) => { if (!this.userCamera) layer.setCamera(this._lerpCam(from, target, t)); });
  }

  /**
   * 地図の枠の実寸を測り、線・地図の SVG の座標系をそれに合わせる。
   * 札（HTML）は CSS の px で置くため、SVG の viewBox が実寸とずれると、線と札が離れて見える。
   * getBoundingClientRect は開く時の拡大・縮小の動きの影響を受けるので、変形の影響を受けない clientWidth/Height を使う
   */
  _measure() {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H || (W === this.W && H === this.H)) return false;
    this.W = W;
    this.H = H;
    for (const l of this.layers) l.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);
    return true;
  }

  _onResize() {
    if (!this._measure()) return;
    if (this.transit) this.transit.finish();
    if (this.steps.length && !this.userCamera) this.layers[this.front].setCamera(this._targetCamera(this.steps[this.index]));
  }

  /* ─────────── 時間軸（rAF 1 本で全部を回す） ─────────── */
  _tween(ms, ease, fn, delay = 0) {
    this._timeline.push({ t0: performance.now() + delay, ms, ease, fn });
  }
  _at(delay, fn) {
    this._timeline.push({ t0: performance.now() + delay, ms: 0, fn, once: true });
  }
  _start() {
    cancelAnimationFrame(this._raf);
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      // 処理中に区間が切り替わる（「次へ」を押す等）と、_enterStep が新しい動きを登録する。
      // その場合は古い残りを捨て、新しく登録された分だけを残す
      const gen = this._gen;
      const list = this._timeline;
      this._timeline = [];
      const keep = list.filter((k) => {
        if (this._gen !== gen) return false;
        if (now < k.t0) return true;
        if (k.once) { k.fn(); return false; }
        const t = clamp01((now - k.t0) / k.ms);
        k.fn(k.ease(t));
        return t < 1;
      });
      this._timeline = this._gen === gen ? keep.concat(this._timeline) : this._timeline;
      this._draw(now);
    };
    this._raf = requestAnimationFrame(loop);
  }
  _stop() {
    cancelAnimationFrame(this._raf);
    this._timeline = [];
  }

  /* ─────────── 毎フレームの描画 ─────────── */
  _draw(now) {
    const step = this.steps[this.index];
    if (!step) return;
    const layer = this.layers[this.front];
    const reduce = reduceMotion();
    // 建物の外 ⇔ 中のズームの間は、線と札を出さない（終わってから描く）
    if (this.transit) {
      this.overlay.style.opacity = '0';
      this.pins.style.opacity = '0';
      return;
    }

    // 階の移動中は、線と札も新しい階と一緒に上下から入ってくる
    const slideTf = this.slide ? `translateY(${this.slide.y.toFixed(1)}px)` : '';
    const slideOp = this.slide ? this.slide.o.toFixed(3) : '';
    this.overlay.style.transform = slideTf;
    this.overlay.style.opacity = slideOp;
    this.pins.style.transform = slideTf;
    this.pins.style.opacity = slideOp;

    const pts = step.seg.points.map((p) => layer.toScreen(p));
    const d = roundedPath(pts, 16);
    this.measure.setAttribute('d', d);
    const len = this.measure.getTotalLength() || 1;
    const drawP = this.drawP;
    for (const p of [this.gHalo, this.gBase]) {
      p.setAttribute('d', d);
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = `${len * (1 - drawP)}`;
    }
    this.gFlow.setAttribute('d', d);
    this.gFlow.style.opacity = this.flowOn ? 1 : 0;

    // 光の頭（描いている先端）
    if (drawP > 0 && drawP < 1) {
      const head = this.measure.getPointAtLength(len * drawP);
      this.gComet.setAttribute('transform', `translate(${head.x.toFixed(1)} ${head.y.toFixed(1)})`);
      this.gComet.style.opacity = 1;
    } else {
      this.gComet.style.opacity = 0;
    }

    // 山形の矢印：一定間隔で進行方向へ流す（reduced-motion では止める）
    const spacing = 54;
    const n = Math.max(0, Math.floor(len / spacing));
    while (this.gChevrons.childNodes.length < n) {
      this.gChevrons.appendChild(svgEl('path', { d: 'M-6,-8 L4,0 L-6,8', class: 'rv-chevron' }));
    }
    const speed = reduce ? 0 : 46; // px/秒
    const phase = this.flowOn ? (((now - (this.flowT0 || now)) / 1000) * speed) % spacing : 0;
    [...this.gChevrons.childNodes].forEach((c, k) => {
      if (k >= n || !this.flowOn) { c.style.opacity = 0; return; }
      const at = (k * spacing + phase + spacing * 0.5) % (n * spacing);
      if (at > len - 10) { c.style.opacity = 0; return; }
      const p = this.measure.getPointAtLength(at);
      const q = this.measure.getPointAtLength(Math.min(len, at + 1));
      const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      const edge = Math.min(at / 40, (len - at) / 40, 1); // 端では薄く
      c.style.opacity = (0.95 * clamp01(edge)).toFixed(2);
      c.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    });

    // 歩く点：2.4 秒ごとにルートを出発地から到着地までたどる
    if (this.flowOn && !reduce) {
      const cyc = ((now - (this.flowT0 || now)) / 2400) % 1;
      const p = this.measure.getPointAtLength(len * easeInOutCubic(clamp01(cyc * 1.15)));
      this.gWalker.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      this.gWalker.style.opacity = cyc > 0.92 ? (1 - cyc) / 0.08 : Math.min(1, cyc / 0.05);
    } else {
      this.gWalker.style.opacity = 0;
    }

    this._drawPins(step, layer);
  }

  /** 出発の輪・到着のピン・階段の番号札（画面座標の HTML） */
  _drawPins(step, layer) {
    const seg = step.seg;
    const want = [];
    const startPt = layer.toScreen(seg.points[0]);
    const endPt = layer.toScreen(seg.points[seg.points.length - 1]);
    // 出入りの札が近いと文字が重なる：着いた方の文字を消す（番号と案内文で分かる）
    const crowded = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) < 96 && this.endP > 0.2;
    if (seg.enterVia) {
      // 着いた階：出た階と同じ番号・同じ色の札を、到着した階段の位置に出す
      want.push({ key: `in-${seg.enterVia.no}`, kind: 'stair', door: seg.enterVia.kind === 'entrance', x: startPt.x, y: startPt.y, no: seg.enterVia.no, text: crowded ? '' : enterLabel(seg), scale: 1 });
    } else {
      want.push({ key: 'start', kind: 'start', x: startPt.x, y: startPt.y, text: crowded ? '' : step.route.from, appear: this.startP });
    }
    if (seg.exitVia) {
      want.push({ key: `out-${seg.exitVia.no}`, kind: 'stair', door: seg.exitVia.kind === 'entrance', x: endPt.x, y: endPt.y, no: seg.exitVia.no, text: exitLabel(seg.exitVia), appear: this.endP, pulse: this.endP >= 1 });
    } else {
      want.push({ key: 'end', kind: 'end', x: endPt.x, y: endPt.y, text: step.route.to, appear: this.endP });
    }
    const keys = new Set(want.map((w) => w.key));
    [...this.pins.children].forEach((c) => { if (!keys.has(c.dataset.key)) c.remove(); });
    for (const w of want) {
      let node = this.pins.querySelector(`[data-key="${w.key}"]`);
      if (!node) {
        node = el('div', `rv-pin rv-pin-${w.kind}`);
        node.dataset.key = w.key;
        node.innerHTML = w.kind === 'stair'
          ? `<span class="rv-stair-ring"></span><span class="rv-stair-badge"><b>${w.no}</b>${w.door ? ICON_DOOR : ICON_STAIRS}</span><span class="rv-pin-label"></span>`
          : w.kind === 'start'
            ? '<span class="rv-start-sonar"></span><span class="rv-start-dot"></span><span class="rv-pin-label"></span>'
            : '<span class="rv-end-shadow"></span><svg class="rv-end-pin" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 51s17-17.6 17-30.5A17 17 0 0 0 3 20.5C3 33.4 20 51 20 51z"/><circle cx="20" cy="20.5" r="6.5"/></svg><span class="rv-pin-label"></span>';
        this.pins.appendChild(node);
      }
      const label = node.querySelector('.rv-pin-label');
      if (label.textContent !== w.text) {
        label.textContent = w.text;
        node.dataset.labelW = '';
      }
      label.hidden = !w.text;
      node.classList.toggle('is-pulse', Boolean(w.pulse));
      const a = w.appear === undefined ? 1 : clamp01(w.appear);
      let ty = 0;
      let sc = w.scale || 1;
      if (w.kind === 'end') {
        // 上から落ちてきて、少し弾んで止まる
        ty = -46 * (1 - easeOutBack(a));
        sc = 0.6 + 0.4 * easeOutBack(a);
      } else if (w.appear !== undefined) {
        sc *= 0.3 + 0.7 * easeOutBack(a);
      }
      node.style.opacity = a.toFixed(3);
      node.style.transform = `translate(${w.x.toFixed(1)}px, ${(w.y + ty).toFixed(1)}px) scale(${sc.toFixed(3)})`;
      // 札が画面の右端・下端にはみ出さないよう、文字の向きを切り替える（文字の幅を測って判断）
      if (!node.dataset.labelW) node.dataset.labelW = String(label.offsetWidth || 0);
      const lw = Number(node.dataset.labelW) || this.W * 0.38;
      const overflowRight = w.x + 34 + lw > this.W - 6;
      node.classList.toggle('label-left', overflowRight && (w.x - 34 - lw > 6 || w.x > this.W / 2));
      node.classList.toggle('label-up', w.y > this.H * 0.78);
    }
  }

  /* ─────────── ヘッダー・案内文・ナビ ─────────── */
  _renderHeader(step, backward) {
    const d = this.dialog;
    const from = d.querySelector('.rv-room-from');
    const to = d.querySelector('.rv-room-to');
    const legChanged = from.textContent !== step.route.from || to.textContent !== step.route.to;
    from.textContent = step.route.from;
    to.textContent = step.route.to;
    const next = d.querySelector('.rv-next-show');
    next.textContent = step.leg.nextShowLabel ? `次の公演：${step.leg.nextShowLabel}` : '';
    next.hidden = !step.leg.nextShowLabel;
    const kicker = step.route.walk ? '会場間のルート' : '会場内のルート';
    d.querySelector('.rv-kicker').textContent = this.legCount > 1 ? `${kicker} ${step.li + 1} / ${this.legCount}` : kicker;
    // 建物の外を通るときだけ、目安の徒歩の時間
    const walk = d.querySelector('.rv-walk');
    walk.hidden = !step.route.walk;
    if (step.route.walk) walk.innerHTML = `${ICON_WALK}<span>徒歩約${step.route.walk.minutes}分</span>`;
    if (legChanged && !reduceMotion()) {
      d.querySelector('.rv-legline').animate(
        [{ opacity: 0, transform: `translateX(${backward ? -18 : 18}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 360, easing: 'cubic-bezier(0.24, 1, 0.4, 1)' },
      );
    }
    // 通る階のレール（この移動で通る階を順に）
    const rail = d.querySelector('.rv-rail');
    const floors = step.route.segments.map((s) => s.floor);
    const key = floors.map((f) => f.id).join('>') + `#${step.li}`;
    if (rail.dataset.key !== key) {
      rail.dataset.key = key;
      rail.innerHTML = floors.map((f, k) => `${k ? '<li class="rv-rail-link" aria-hidden="true"><span></span></li>' : ''}<li class="rv-rail-floor">${Parser.escapeHtml(f.label)}</li>`).join('');
      rail.hidden = floors.length < 2;
    }
    const pillEls = [...rail.querySelectorAll('.rv-rail-floor')];
    const linkEls = [...rail.querySelectorAll('.rv-rail-link')];
    pillEls.forEach((p, k) => {
      p.classList.toggle('is-active', k === step.si);
      p.classList.toggle('is-done', k < step.si);
    });
    linkEls.forEach((l, k) => l.classList.toggle('is-done', k < step.si));
  }

  _renderInstruction(step) {
    const box = this.dialog.querySelector('.rv-instruction');
    const seg = step.seg;
    let html;
    const esc = Parser.escapeHtml;
    if (seg.exitVia) {
      const v = seg.exitVia;
      const icon = v.kind === 'entrance' ? ICON_DOOR : ICON_STAIRS;
      let text;
      if (v.kind === 'entrance' && v.through) {
        text = v.toFloor.outdoor
          ? `<strong>${esc(v.name)}</strong>で降り、<strong>${esc(v.through)}</strong>から<strong>外</strong>へ`
          : `<strong>${esc(v.name)}</strong>から入り、<strong>${esc(v.through)}</strong>で<strong>${esc(v.toFloor.label)}</strong>へ`;
      } else if (v.kind === 'entrance') {
        text = v.toFloor.outdoor
          ? `<strong>${esc(v.name)}</strong>から<strong>外</strong>へ`
          : `<strong>${esc(v.name)}</strong>から<strong>${esc(v.toFloor.label)}</strong>へ`;
      } else {
        text = `<strong>${esc(v.name)}</strong>で<strong>${esc(v.toFloor.label)}</strong>へ`;
      }
      html = `<span class="rv-ins-badge"><b>${v.no}</b>${icon}</span><span class="rv-ins-text">${text}</span>`;
    } else {
      // 到着：階の名前（屋外では出さない）と、部屋の目印
      const small = [seg.floor.outdoor ? '' : seg.floor.label, step.route.note].filter(Boolean).map(esc).join('・');
      html = `<span class="rv-ins-goal" aria-hidden="true"></span>
        <span class="rv-ins-text"><strong>${esc(step.route.to)}</strong>に到着${small ? `<small>${small}</small>` : ''}</span>`;
    }
    const head = seg.enterVia
      ? `<p class="rv-ins-sub"><span class="rv-ins-mini"><b>${seg.enterVia.no}</b></span>${esc(enterLabel(seg))}</p>`
      : `<p class="rv-ins-sub">${seg.floor.outdoor ? '' : `${esc(seg.floor.label)}・`}${esc(step.route.from)}から出発</p>`;
    box.innerHTML = `${head}<div class="rv-ins-main">${html}</div>`;
    if (!reduceMotion()) {
      box.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.24, 1, 0.4, 1)' });
    }
  }

  _renderDots() {
    const dots = this.dialog.querySelector('.rv-dots');
    dots.innerHTML = this.steps.map(() => '<i></i>').join('');
  }

  _updateNav() {
    const d = this.dialog;
    const prev = d.querySelector('.rv-prev');
    const next = d.querySelector('.rv-next');
    prev.disabled = this.index === 0;
    const last = this.index === this.steps.length - 1;
    const step = this.steps[this.index];
    const nextStep = this.steps[this.index + 1];
    let label = '閉じる';
    if (!last) {
      const v = step.seg.exitVia;
      label = v ? (v.toFloor.outdoor ? '外へ' : `${v.toFloor.label}へ`) : (nextStep.li !== step.li ? '次の移動へ' : '次へ');
    }
    next.querySelector('span').textContent = label;
    next.classList.toggle('is-close', last);
    [...d.querySelectorAll('.rv-dots i')].forEach((dot, k) => {
      dot.classList.toggle('is-active', k === this.index);
      dot.classList.toggle('is-done', k < this.index);
    });
  }

  /* ─────────── ピンチ・ドラッグ ─────────── */
  _bindGestures() {
    const pts = new Map();
    let base = null;
    const stage = this.stage;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      base = null;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || this.transit) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const layer = this.layers[this.front];
      const rect = stage.getBoundingClientRect();
      const arr = [...pts.values()].map((p) => ({ x: p.x - rect.left, y: p.y - rect.top }));
      const mid = arr.length === 2 ? { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 } : arr[0];
      const dist = arr.length === 2 ? Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y) : 0;
      if (!base || base.n !== arr.length) {
        base = { n: arr.length, mid, dist, cam: { ...layer.camera } };
        return;
      }
      this.userCamera = true;
      this._timeline = this._timeline.filter((k) => k.once);
      const s = arr.length === 2 && base.dist > 0 ? Math.min(8, Math.max(0.2, base.cam.s * (dist / base.dist))) : base.cam.s;
      // 指の中点が指していた地図上の点を、指の中点の下に保つ
      const mx = (base.mid.x - base.cam.tx) / base.cam.s;
      const my = (base.mid.y - base.cam.ty) / base.cam.s;
      layer.setCamera({ s, tx: mid.x - mx * s, ty: mid.y - my * s });
      this.flowOn = true;
      this.drawP = 1;
      this.endP = 1;
      this.startP = 1;
    });
    const up = (e) => { pts.delete(e.pointerId); base = null; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.transit) return;
      const layer = this.layers[this.front];
      const rect = stage.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const c = layer.camera;
      const s = Math.min(8, Math.max(0.2, c.s * Math.exp(-e.deltaY * 0.0015)));
      this.userCamera = true;
      layer.setCamera({ s, tx: p.x - ((p.x - c.tx) / c.s) * s, ty: p.y - ((p.y - c.ty) / c.s) * s });
    }, { passive: false });
  }
}
