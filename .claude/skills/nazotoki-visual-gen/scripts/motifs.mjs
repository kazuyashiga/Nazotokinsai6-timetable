/**
 * 図形だけで描くモチーフ集。どれも「それ自体が小さな謎」になっている。
 * 各関数は (p, m) を受け取り、m.slot に絶対配置した HTML 文字列を返す。
 *   p … spec のポスター、m … p.motif（slot と各モチーフの設定）
 * 画像生成は使わない。文字は Google Fonts をページ側で読み込んだ書体で描く。
 */

const wrap = (s, inner, extra = '') =>
  `<div class="motif" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;${extra}">${inner}</div>`;
const svgOpen = (w, h, extra = '') => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${extra} xmlns="http://www.w3.org/2000/svg">`;

/* ───────── 1. ピッグペン暗号（影絵）─────────
 * 格子2つ（A–I / J–R は点付き）と X 字2つ（S–V / W–Z は点付き）。解読表も一緒に描くので解ける。 */
const GRID_SIDES = {
  // 上・右・下・左
  0: [0, 1, 1, 0], 1: [0, 1, 1, 1], 2: [0, 0, 1, 1],
  3: [1, 1, 1, 0], 4: [1, 1, 1, 1], 5: [1, 0, 1, 1],
  6: [1, 1, 0, 0], 7: [1, 1, 0, 1], 8: [1, 0, 0, 1],
};
function pigpenGlyph(ch, x, y, g, t, color) {
  const i = ch.charCodeAt(0) - 65;
  let d = '';
  let dot = null;
  if (i < 18) {
    const [top, right, bottom, left] = GRID_SIDES[i % 9];
    if (top) d += `M${x},${y}H${x + g}`;
    if (right) d += `M${x + g},${y}V${y + g}`;
    if (bottom) d += `M${x},${y + g}H${x + g}`;
    if (left) d += `M${x},${y}V${y + g}`;
    if (i >= 9) dot = [x + g / 2, y + g / 2];
  } else {
    const k = (i - 18) % 4; // S/W: V、T/X: >、U/Y: <、V/Z: ^
    const c = [x + g / 2, y + g / 2];
    if (k === 0) { d = `M${x},${y}L${c[0]},${y + g}L${x + g},${y}`; dot = [c[0], y + g * 0.3]; }
    if (k === 1) { d = `M${x},${y}L${x + g},${c[1]}L${x},${y + g}`; dot = [x + g * 0.3, c[1]]; }
    if (k === 2) { d = `M${x + g},${y}L${x},${c[1]}L${x + g},${y + g}`; dot = [x + g * 0.7, c[1]]; }
    if (k === 3) { d = `M${x},${y + g}L${c[0]},${y}L${x + g},${y + g}`; dot = [c[0], y + g * 0.7]; }
    if (i < 22) dot = null;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linecap="square" stroke-linejoin="miter"/>` +
    (dot ? `<circle cx="${dot[0]}" cy="${dot[1]}" r="${t * 0.62}" fill="${color}"/>` : '');
}
function pigpenKey(x, y, cell, color, font) {
  // 解読表：# 格子2つと X 字2つ。文字は各区画に置く
  const out = [];
  const grid = (ox, letters, dotted) => {
    out.push(`<path d="M${ox + cell},${y}V${y + cell * 3}M${ox + cell * 2},${y}V${y + cell * 3}M${ox},${y + cell}H${ox + cell * 3}M${ox},${y + cell * 2}H${ox + cell * 3}" stroke="${color}" stroke-width="3" fill="none"/>`);
    [...letters].forEach((L, n) => {
      const cx = ox + (n % 3) * cell + cell / 2;
      const cy = y + Math.floor(n / 3) * cell + cell / 2;
      out.push(`<text x="${cx}" y="${cy + cell * 0.14}" font-family="${font}" font-size="${cell * 0.42}" text-anchor="middle" fill="${color}">${L}</text>`);
      if (dotted) out.push(`<circle cx="${cx + cell * 0.3}" cy="${cy - cell * 0.22}" r="4" fill="${color}"/>`);
    });
  };
  const cross = (ox, letters, dotted) => {
    const s = cell * 3;
    out.push(`<path d="M${ox},${y}L${ox + s},${y + s}M${ox + s},${y}L${ox},${y + s}" stroke="${color}" stroke-width="3" fill="none"/>`);
    const pos = [[ox + s / 2, y + s * 0.2], [ox + s * 0.2, y + s / 2], [ox + s * 0.8, y + s / 2], [ox + s / 2, y + s * 0.82]];
    [...letters].forEach((L, n) => {
      out.push(`<text x="${pos[n][0]}" y="${pos[n][1] + cell * 0.14}" font-family="${font}" font-size="${cell * 0.42}" text-anchor="middle" fill="${color}">${L}</text>`);
      if (dotted) out.push(`<circle cx="${pos[n][0] + cell * 0.28}" cy="${pos[n][1] - cell * 0.2}" r="4" fill="${color}"/>`);
    });
  };
  const gap = cell * 0.9;
  grid(x, 'ABCDEFGHI', false);
  grid(x + cell * 3 + gap, 'JKLMNOPQR', true);
  cross(x + (cell * 3 + gap) * 2, 'STUV', false);
  cross(x + (cell * 3 + gap) * 3, 'WXYZ', true);
  return out.join('');
}
export function pigpen(p, m) {
  const s = m.slot;
  const word = m.word ?? 'SAMPLE';
  const cols = 3;
  const keyCell = m.keyCell ?? 44;
  const keyH = keyCell * 3;
  const g = Math.min((s.w * 0.86) / cols, (s.h - keyH - 120) / 2) * 0.62;
  const t = g * 0.17;
  const pitch = g / 0.62;
  const gx = (s.w - pitch * cols) / 2 + (pitch - g) / 2;
  const sh = m.shadow ?? 'rgba(0,0,0,.22)';
  let glyphs = '';
  let shadows = '';
  [...word].forEach((ch, n) => {
    const x = gx + (n % cols) * pitch;
    const y = 24 + Math.floor(n / cols) * pitch;
    shadows += pigpenGlyph(ch, x + t * 0.9, y + t * 0.9, g, t, sh);
    glyphs += pigpenGlyph(ch, x, y, g, t, m.ink);
  });
  const keyW = keyCell * 3 * 4 + keyCell * 0.9 * 3;
  const key = pigpenKey(s.w - keyW, s.h - keyH, keyCell, m.keyInk ?? m.ink, m.keyFont ?? 'JetBrains Mono');
  return wrap(s, `${svgOpen(s.w, s.h)}${shadows}${glyphs}${key}</svg>`);
}

/* ───────── 2. 対応表（色紙の図形）─────────
 * 上段に「図形＝カナ」の対応表（順番はばらばら）、下段に図形の並び。並びを読むと答え。 */
const SHAPES = {
  circle: (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`,
  square: (cx, cy, r, c) => `<rect x="${cx - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" fill="${c}"/>`,
  triangle: (cx, cy, r, c) => `<path d="M${cx},${cy - r}L${cx + r * 1.05},${cy + r * 0.8}L${cx - r * 1.05},${cy + r * 0.8}Z" fill="${c}"/>`,
  star: (cx, cy, r, c) => {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.46 : r * 1.05;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${c}"/>`;
  },
};
export function legend(p, m) {
  const s = m.slot;
  const items = m.items; // [{shape, color, kana}] 答えの順
  const order = m.legendOrder ?? items.map((_, i) => i);
  const font = m.font ?? p.font;
  const tilt = [-6, 4, -3, 7, -5];
  const shadow = `<filter id="cut" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="6" dy="8" stdDeviation="0" flood-color="#3a2a10" flood-opacity=".18"/></filter>`;
  const r1 = 64;
  const row1 = order.map((idx, n) => {
    const it = items[idx];
    const cx = s.w * (n + 0.5) / order.length;
    return `<g transform="rotate(${tilt[n % 5]} ${cx} 150)" filter="url(#cut)">${SHAPES[it.shape](cx, 120, r1, it.color)}</g>` +
      `<text x="${cx}" y="300" font-family="${font}" font-weight="900" font-size="64" text-anchor="middle" fill="${m.ink}">＝${it.kana}</text>`;
  }).join('');
  const r2 = 92;
  const y2 = s.h - 170;
  const row2 = items.map((it, n) => {
    const cx = s.w * 0.1 + (s.w * 0.62) * (n + 0.5) / items.length;
    return `<g transform="rotate(${tilt[(n + 2) % 5]} ${cx} ${y2})" filter="url(#cut)">${SHAPES[it.shape](cx, y2, r2, it.color)}</g>`;
  }).join('');
  const q = `<text x="${s.w * 0.86}" y="${y2 + 44}" font-family="${font}" font-weight="900" font-size="128" text-anchor="middle" fill="${m.ink}">？</text>` +
    `<path d="M${s.w * 0.73},${y2}h${s.w * 0.06}" stroke="${m.ink}" stroke-width="10" stroke-linecap="round"/><path d="M${s.w * 0.775},${y2 - 18}l22,18l-22,18" stroke="${m.ink}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const rule = `<path d="M${s.w * 0.05},${(300 + y2 - r2) / 2 + 12}H${s.w * 0.95}" stroke="${m.ink}" stroke-width="4" stroke-dasharray="4 18" stroke-linecap="round"/>`;
  return wrap(s, `${svgOpen(s.w, s.h)}<defs>${shadow}</defs>${row1}${rule}${row2}${q}</svg>`);
}

/* ───────── 3. 網点の隠し文字（リソ2色）─────────
 * 一面の黄色い網点の中に、ピンクの点で文字が隠れている。文字の形はページ側で書体から拾う。 */
export function dotword(p, m) {
  const s = m.slot;
  const cfg = JSON.stringify({ lines: m.lines, font: m.font ?? p.font, pitch: m.pitch ?? 24, on: m.on, off: m.off, misreg: m.misreg ?? [3, 2] });
  return wrap(s, `<svg width="${s.w}" height="${s.h}" data-dotword='${cfg.replace(/'/g, '&#39;')}'></svg>`);
}
/** ページ内で実行：data-dotword の SVG に網点を描く（書体の読み込み後） */
export const dotwordScript = `
window.__motifReady = false;
// ページを組み終えてから、使う書体を明示的に読み込んで描く（先に走ると SVG が無く白紙になる）
window.addEventListener('DOMContentLoaded', async () => {
  for (const svg of document.querySelectorAll('svg[data-dotword]')) {
    const c = JSON.parse(svg.dataset.dotword);
    await document.fonts.load('400 80px "' + c.font + '"', c.lines.join(''));
    const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const size = Math.min(W / Math.max(...c.lines.map((l) => l.length)) * 0.94, H / c.lines.length * 0.86);
    ctx.font = '400 ' + size + 'px "' + c.font + '"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    c.lines.forEach((l, i) => ctx.fillText(l, W / 2, H * (i + 0.5) / c.lines.length));
    const data = ctx.getImageData(0, 0, W, H).data;
    let rnd = 7; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    let off = '', on = '';
    for (let y = c.pitch / 2; y < H; y += c.pitch) for (let x = c.pitch / 2; x < W; x += c.pitch) {
      const ink = data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] > 128;
      const r = c.pitch * (ink ? 0.42 : 0.18 + rand() * 0.2);
      (ink ? (on += '<circle cx="' + x + '" cy="' + y + '" r="' + r.toFixed(1) + '"/>') : (off += '<circle cx="' + x + '" cy="' + y + '" r="' + r.toFixed(1) + '"/>'));
    }
    svg.innerHTML = '<g fill="' + c.off + '">' + off + '</g><g fill="' + c.on + '" style="mix-blend-mode:multiply" transform="translate(' + c.misreg[0] + ' ' + c.misreg[1] + ')">' + on + '</g>';
    if (!on) console.error('dotword: 文字の点が 1 つも拾えませんでした');
  }
  window.__motifReady = true;
});`;

/* ───────── 4. 昇る文字（巨大タイポ）─────────
 * 舞台の床から文字の上半分だけが昇っている。下半分は床に隠れる。 */
export function rising(p, m) {
  const s = m.slot;
  const horizon = s.h * (m.horizon ?? 0.62);
  const size = Math.min(s.w / m.word.length * 0.92, s.h * 0.9);
  const font = m.font ?? p.font;
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI * (0.1 + 0.8 * i / 8);
    const x2 = s.w / 2 - Math.cos(a) * s.w;
    const y2 = horizon - Math.sin(a) * s.w;
    return `<path d="M${s.w / 2},${horizon}L${x2.toFixed(0)},${y2.toFixed(0)}" stroke="${m.ray}" stroke-width="${i % 2 ? 6 : 14}"/>`;
  }).join('');
  return wrap(s, `${svgOpen(s.w, s.h)}<defs><clipPath id="above"><rect width="${s.w}" height="${horizon}"/></clipPath></defs>
    <g opacity=".9">${rays}</g>
    <g clip-path="url(#above)"><text x="${s.w / 2}" y="${horizon + size * (m.sink ?? 0.36)}" font-family="${font}" font-size="${size}" text-anchor="middle" fill="${m.ink}" letter-spacing="-${size * 0.04}">${m.word}</text></g>
    <rect y="${horizon}" width="${s.w}" height="${s.h - horizon}" fill="${m.floor}"/>
    ${Array.from({ length: 5 }, (_, i) => `<path d="M0,${horizon + 30 + i * i * 18}H${s.w}" stroke="${m.floorLine}" stroke-width="${3 + i}"/>`).join('')}
  </svg>`);
}

/* ───────── 6. 逆さ文字（切り絵のクリームソーダ）─────────
 * 紙を重ねたグラスと、テーブルに映った逆さ文字。紙の層ごとに接地の影を落とす。 */
export function soda(p, m) {
  const s = m.slot;
  const cx = s.w / 2;
  const top = 200, bottom = s.h - 300, wTop = 300, wBot = 170;
  const glass = `M${cx - wTop / 2},${top}L${cx + wTop / 2},${top}L${cx + wBot / 2},${bottom}L${cx - wBot / 2},${bottom}Z`;
  const inset = 22;
  const soda = `M${cx - wTop / 2 + inset},${top + 90}L${cx + wTop / 2 - inset},${top + 90}L${cx + wBot / 2 - inset},${bottom - inset}L${cx - wBot / 2 + inset},${bottom - inset}Z`;
  const bubbles = [[-60, 200, 18], [40, 260, 12], [-20, 360, 22], [55, 430, 14], [-50, 520, 12], [20, 580, 20], [-10, 680, 10]]
    .map(([dx, dy, r]) => `<circle cx="${cx + dx}" cy="${top + dy}" r="${r}" fill="${m.paper}"/>`).join('');
  const table = s.h - 300;
  const sh = `<filter id="paper" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="7" dy="9" stdDeviation="0" flood-color="#2a1608" flood-opacity=".22"/></filter>`;
  return wrap(s, `${svgOpen(s.w, s.h)}<defs>${sh}</defs>
    <g filter="url(#paper)"><rect x="${cx + 40}" y="${top - 180}" width="22" height="350" fill="${m.straw}" transform="rotate(14 ${cx + 51} ${top})"/></g>
    <g filter="url(#paper)"><path d="${glass}" fill="${m.glass}"/></g>
    <g filter="url(#paper)"><path d="${soda}" fill="${m.soda}"/></g>
    <g filter="url(#paper)">${bubbles}</g>
    <g filter="url(#paper)"><circle cx="${cx - 70}" cy="${top + 40}" r="80" fill="${m.paper}"/><circle cx="${cx + 60}" cy="${top + 30}" r="90" fill="${m.paper}"/><circle cx="${cx}" cy="${top - 20}" r="96" fill="${m.paper}"/></g>
    <g filter="url(#paper)"><circle cx="${cx + 18}" cy="${top - 128}" r="40" fill="${m.cherry}"/><path d="M${cx + 30},${top - 162}q30,-60 70,-70" stroke="${m.ink}" stroke-width="7" fill="none"/></g>
    <g filter="url(#paper)"><rect x="${cx - wBot / 2 - 50}" y="${bottom}" width="${wBot + 100}" height="34" fill="${m.glass}"/></g>
    <rect x="0" y="${table + 34}" width="${s.w}" height="${s.h - table - 34}" fill="${m.table}"/>
    <text x="${cx}" y="${table + 64}" font-family="${m.font ?? p.font}" font-weight="700" font-size="${m.mirrorSize ?? 112}" text-anchor="middle" fill="${m.mirror}" transform="translate(0 ${(table + 64) * 2}) scale(1 -1)">${m.word}</text>
  </svg>`);
}

/* ───────── 7. 路線図（周遊）─────────
 * 街区の間を通るルートを順にたどると、駅名のカナが答えになる。ルート外の駅はおとり。 */
export function route(p, m) {
  const s = m.slot;
  const font = m.font ?? p.font;
  const blocks = [];
  const bw = s.w / 4, bh = s.h / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    blocks.push(`<rect x="${c * bw + 14}" y="${r * bh + 14}" width="${bw - 28}" height="${bh - 28}" rx="10" fill="${m.block}"/>`);
  }
  const P = (c, r) => [c * bw, r * bh]; // 街路の交点
  const path = m.path.map(([c, r]) => P(c, r));
  const d = 'M' + path.map(([x, y]) => `${x},${y}`).join('L');
  const station = ([c, r], label, onRoute) => {
    const [x, y] = P(c, r);
    return `<circle cx="${x}" cy="${y}" r="44" fill="${onRoute ? m.paper : m.decoyFill}" stroke="${onRoute ? m.line : m.decoy}" stroke-width="9"/>` +
      `<text x="${x}" y="${y + 17}" font-family="${font}" font-weight="600" font-size="50" text-anchor="middle" fill="${onRoute ? m.line : m.paper}">${label}</text>`;
  };
  const [sx, sy] = path[0];
  const start = `<path d="M${sx - 2},${sy - 40}v-86" stroke="${m.ink}" stroke-width="7"/><path d="M${sx},${sy - 126}h66l-16,22l16,22h-66z" fill="${m.line}"/>`;
  const [ex, ey] = path[path.length - 1];
  const [px, py] = path[path.length - 2];
  const ang = Math.atan2(ey - py, ex - px) * 180 / Math.PI;
  const arrow = `<path d="M-26,-22L8,0L-26,22" fill="none" stroke="${m.line}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" transform="translate(${ex - Math.cos(ang * Math.PI / 180) * 62} ${ey - Math.sin(ang * Math.PI / 180) * 62}) rotate(${ang})"/>`;
  const stations = m.stations.map(([pt, label]) => station(pt, label, true)).join('') +
    m.decoys.map(([pt, label]) => station(pt, label, false)).join('');
  return wrap(s, `${svgOpen(s.w, s.h, 'overflow="visible"')}${blocks.join('')}
    <path d="${d}" fill="none" stroke="${m.line}" stroke-width="14" stroke-dasharray="2 30" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrow}${start}${stations}</svg>`);
}

export const MOTIFS = { pigpen, legend, dotword, rising, soda, route };
