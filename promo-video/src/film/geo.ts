import { getLength, getPointAtLength } from "@remotion/paths";
import { Easing } from "remotion";
import routeClip from "../../public/footage/route.json";

/**
 * モーション版（Film）の「世界」：1 枚の大きな時間割の上に、場面（駅）を 3×3 に並べ、1 本の線でつなぐ。
 *   列 1（下へ）：開場 → 課題（PDF） → いいところ 3 つ
 *   列 2（上へ）：基本機能（3 台）→ 地図 → スキマ提案
 *   列 3（下へ）：＋1 → スプシ → ゴール（DM）
 * 座標の単位は、カメラの倍率 1 のときの画面の px。
 */

export type Ease = (t: number) => number;
export const IO: Ease = Easing.bezier(0.65, 0, 0.35, 1); // 移動：静かに出て、静かに止まる
export const OUT: Ease = Easing.bezier(0.16, 1, 0.3, 1); // 着地：素早く出て、ゆっくり止まる
export const SLASH: Ease = Easing.bezier(0.75, 0, 0.15, 1); // 切り裂く：溜めて、一気に
export const LIN: Ease = (t) => t;

/* ─────────── 時間の伸び縮み ───────────
 * 場面ごとの表示時間を調整するため、コードに書く時刻は「設計の時刻」とし、T() で「実際の時刻」に直す。
 * EDITS の各行 [設計の時刻 p, フレーム数 e]：
 *   e > 0 … p 以降を e フレーム遅らせる（p の直前に間を足す。p は静止中の区間に置く）
 *   e < 0 … p の直前の |e| フレームを詰める（移動中の区間に置くと、その移動が速くなる）
 * アニメーションの長さ（spring・Rise・素材の再生）は実際の時刻のまま変わらない。
 */
/** 地図の素材の長さ（1.8 秒目から最後まで。設計は撮り直し前の 289 フレームで組んである） */
const ROUTE_FRAMES = Math.round((routeClip.seconds - 1.8) * 30);
export const EDITS: [number, number][] = [
  // ── 読む時間を足す（静止中に間を入れる）・移動を詰める ── capture/timing-audit.ts で点検
  [104, 20], // 開場：見出しを読む間
  [136, -18], // 開場 → 課題の移動を速く
  [202, 45], // 課題：× 3 行を読んでから切り裂く
  [252, 21], // 課題：「ぜんぶ、スマホで。」を読む間
  [290, -18], // 課題 → いいところの移動
  [420, 20], // いいところ：3 枚目のカードを読む間
  [450, -16], // いいところ → 基本機能の移動
  [552, 27], // 基本機能：選ぶ
  [642, 27], // 基本機能：絞る
  [720, 35], // 基本機能：共有（カメラが離れる前に間を入れる）
  [750, -12], // 基本機能 → 地図の移動
  [1041, ROUTE_FRAMES - 289], // 地図：撮り直して短くなった素材に合わせて詰める
  [1211, 45], // スキマ提案：「“もうひとつ”が増える」を読む間
  [1245, -16], // スキマ提案 → ＋1 の移動
  [1356, 105], // ＋1：見出しと「期待できる効果」を読む間
  [1385, -14], // ＋1 → スプシの移動
  [1500, 12], // スプシ：見出しを読む間
  [1530, -14], // スプシ → ゴールの移動
  [1690, -30], // ゴール：少し詰める
  [1780, 90], // 終わり：見出しと「ご相談は DM へ」を読む間
];
export const T = (d: number): number => {
  let r = d;
  for (const [p, e] of EDITS) {
    if (e >= 0) {
      if (d >= p) r += e;
    } else {
      const c0 = p + e;
      if (d >= p) r += e;
      else if (d > c0) r += c0 - d;
    }
  }
  return Math.round(r);
};

/** フィルムの長さ（30fps） */
export const FILM_FRAMES = T(1780);

type Pt = [number, number];

/* ─────────── 駅の位置（カメラの中心） ─────────── */
export const ST = {
  hook: [960, 540] as Pt,
  pdf: [960, 1860] as Pt,
  points: [960, 3180] as Pt,
  basic: [3360, 3150] as Pt,
  map: [3260, 1860] as Pt,
  gap: [3360, 540] as Pt,
  plus: [5760, 540] as Pt,
  sheet: [5760, 1860] as Pt,
  cta: [5760, 3180] as Pt,
};

/* ─────────── スマホの寸法（Phone コンポーネントと同じ計算） ─────────── */
export const phoneBox = (h: number) => {
  const bezel = Math.round(h * 0.022);
  const screenH = h - bezel * 2;
  const screenW = Math.round(screenH * (390 / 664));
  return { h, w: screenW + bezel * 2, bezel, screenW, screenH };
};

/** 地図のスマホ（素材の画面座標を世界へ写すのに使う） */
const MAP_BOX = phoneBox(920);
export const PHONE = { ...MAP_BOX, cx: 2940, cy: 1860, left: 2940 - MAP_BOX.w / 2, top: 1860 - MAP_BOX.h / 2 };
/** 素材の画面座標（CSS px）→ 世界座標 */
export const fromScreen = (x: number, y: number): Pt => [
  PHONE.left + PHONE.bezel + (x * PHONE.screenW) / 390,
  PHONE.top + PHONE.bezel + (y * PHONE.screenH) / 664,
];
/** 地図：予定一覧の「ルートを見る」（素材 route の 2.33 秒のタップ位置） */
export const ROUTE_BTN = fromScreen(307.28, 224.92);

/** スキマ提案のスマホ（線はこのスマホの裏を通り抜ける） */
export const GAP_PHONE = { cx: 2940, cy: 540, h: 920 };

/** 基本機能：3 台のスマホ（選ぶ・絞る・共有）と、その下を走る線 */
export const BASIC = { cy: 3150, h: 560, xs: [2880, 3360, 3840] as number[], railY: 3480 };

/* ─────────── 駅の中身の位置 ─────────── */
export const START: Pt = [260, 760];
export const HOOK_RAIL_Y = 760;
export const PDF = { x: 200, y: 1420, w: 800, h: 560 }; // 中心 y = 1700（線が横に切り裂く高さ）
export const POINTS = { railY: 2900, cardX: 200, cardY: 2960, cardW: 512, cardH: 460, gap: 42 };
export const POINT_CENTERS = [0, 1, 2].map((i) => POINTS.cardX + i * (POINTS.cardW + POINTS.gap) + POINTS.cardW / 2);
export const LOOP = { cx: 5300, cy: 540, r: 260 };
export const SHEET = { x: 5160, y: 1640, menu: [5620, 1796] as Pt };
export const PUB = { cx: 5760, cy: 1965, h: 660 };
export const DM_END: Pt = [6430, 3290];

/* ─────────── 線の形 ─────────── */
/** 折れ線の角を丸めた SVG パス */
export const rounded = (pts: Pt[], r: number): string => {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L ${x1 + ((x0 - x1) / l1) * rr} ${y1 + ((y0 - y1) / l1) * rr} Q ${x1} ${y1} ${x1 + ((x2 - x1) / l2) * rr} ${y1 + ((y2 - y1) / l2) * rr}`;
  }
  const [xn, yn] = pts[pts.length - 1];
  return `${d} L ${xn} ${yn}`;
};

/** パス上で (x, y) に一番近い点までの長さ（線の頭をどこまで進めるかを、座標で指定するため） */
const lenAt = (d: string, x: number, y: number): number => {
  const total = getLength(d);
  let best = 0;
  let bestD = Infinity;
  for (let l = 0; l <= total; l += 4) {
    const p = getPointAtLength(d, l);
    if (!p) continue;
    const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dd < bestD) { bestD = dd; best = l; }
  }
  return best;
};

type HeadKey = [number, number | Pt | "end", Ease?];
export type Leg = {
  id: string;
  d: string;
  total: number;
  keys: [number, number, Ease][];
  /** スマホの上に重ねて描く（地図のボタンへ入っていく区間） */
  over?: boolean;
  /** この区間で線を消す [開始, 終了] */
  fade?: [number, number];
};
const leg = (id: string, d: string, keys: HeadKey[], opts: Partial<Leg> = {}): Leg => {
  const total = getLength(d);
  return {
    id,
    d,
    total,
    keys: keys.map(([f, v, e]) => [T(f), v === "end" ? total : typeof v === "number" ? v : lenAt(d, v[0], v[1]), e ?? IO]),
    ...opts,
    fade: opts.fade ? [T(opts.fade[0]), T(opts.fade[1])] : undefined,
  };
};

/* ─────────── 時刻（フレーム） ─────────── */
/** 基本機能：3 台を順に強調する区間 [開始, 終了]（線の頭が各スマホの下に着く） */
const D_BASIC_WIN: [number, number][] = [
  [470, 552],
  [560, 642],
  [650, 724],
];
export const BASIC_WIN: [number, number][] = D_BASIC_WIN.map(([a, b]) => [T(a), T(b)]);
/** 地図の素材（route）を流し始めるフレーム：素材の 2.33 秒（「ルートを見る」のタップ）が 768 になる */
const D_ROUTE_START = 752;
const D_ROUTE_END = D_ROUTE_START + 289;
export const ROUTE_START = T(D_ROUTE_START);
export const ROUTE_END = T(D_ROUTE_END);
/** スキマ提案の素材 */
/** from：「Now Solving…」の読み込みは最後の 0.6 秒だけ見せる */
export const GAP_CLIP = { from: 2.35, start: T(1050) };
/** スプシ：メニューを押す瞬間（設計の時刻） */
const D_CLICK = 1440;
export const CLICK = T(D_CLICK);

export const LEGS: Leg[] = [
  // A：開場（時間割の軸）→ PDF を横に切り裂く → いいところ 3 つ → 基本機能の下 → 地図のスマホの上まで
  leg(
    "A",
    rounded(
      [
        START,
        [1840, HOOK_RAIL_Y],
        [1840, 1700],
        [120, 1700],
        [120, POINTS.railY],
        [2250, POINTS.railY],
        [2250, BASIC.railY],
        [4500, BASIC.railY],
        [4500, 1280],
        [ROUTE_BTN[0], 1280],
        [ROUTE_BTN[0], PHONE.top],
      ],
      90,
    ),
    [
      [14, 0],
      [82, [1700, HOOK_RAIL_Y], OUT],
      [104, [1840, 840]],
      [150, [1840, 1620]],
      [164, [1700, 1700]],
      [202, [1040, 1700], LIN],
      [216, [190, 1700], SLASH],
      [252, [120, 1800], OUT],
      [296, [120, 2820]],
      [306, [200, POINTS.railY], OUT],
      [354, [POINT_CENTERS[2] + 60, POINTS.railY], LIN],
      [420, [2150, POINTS.railY], OUT],
      [436, [2150, POINTS.railY], LIN],
      [470, [BASIC.xs[0], BASIC.railY], IO],
      [D_BASIC_WIN[1][0] - 8, [BASIC.xs[0] + 10, BASIC.railY], LIN],
      [D_BASIC_WIN[1][0], [BASIC.xs[1], BASIC.railY], OUT],
      [D_BASIC_WIN[2][0] - 8, [BASIC.xs[1] + 10, BASIC.railY], LIN],
      [D_BASIC_WIN[2][0], [BASIC.xs[2], BASIC.railY], OUT],
      [726, [BASIC.xs[2] + 20, BASIC.railY], LIN],
      [742, [4500, 2900]],
      [758, [4500, 1380], LIN],
      [764, "end", LIN],
    ],
  ),
  // A2：画面の中へ入り、「ルートを見る」を押す（押したら消え、地図アプリの線に引き継ぐ）
  leg("A2", `M ${ROUTE_BTN[0]} ${PHONE.top} L ${ROUTE_BTN[0]} ${ROUTE_BTN[1]}`, [
    [764, 0],
    [768, "end", OUT],
  ], { over: true, fade: [774, 788] }),
  // D：地図のスマホの上から出て、スキマ提案のスマホを通り抜け、＋1 の輪を描いて、スプシのボタンへ
  leg(
    "D",
    `M ${PHONE.cx} ${PHONE.top} L ${GAP_PHONE.cx} ${-40 + 90} Q ${GAP_PHONE.cx} -40 ${GAP_PHONE.cx + 90} -40 L ${LOOP.cx - LOOP.r - 90} -40 Q ${LOOP.cx - LOOP.r} -40 ${LOOP.cx - LOOP.r} 50 L ${LOOP.cx - LOOP.r} ${LOOP.cy} A ${LOOP.r} ${LOOP.r} 0 0 0 ${LOOP.cx + LOOP.r} ${LOOP.cy} A ${LOOP.r} ${LOOP.r} 0 0 0 ${LOOP.cx - LOOP.r} ${LOOP.cy} L ${LOOP.cx - LOOP.r} 2060 Q ${LOOP.cx - LOOP.r} 2150 ${LOOP.cx - LOOP.r + 90} 2150 L ${SHEET.menu[0] - 90} 2150 Q ${SHEET.menu[0]} 2150 ${SHEET.menu[0]} 2060 L ${SHEET.menu[0]} ${SHEET.menu[1]}`,
    [
      [1040, 0],
      [1058, [GAP_PHONE.cx, GAP_PHONE.cy + 450], OUT],
      [1205, [GAP_PHONE.cx, GAP_PHONE.cy + 440], LIN],
      [1218, [GAP_PHONE.cx, GAP_PHONE.cy - 470], IO],
      [1258, [LOOP.cx - LOOP.r, LOOP.cy - 2]],
      [1290, [LOOP.cx - LOOP.r, LOOP.cy + 30], LIN],
      [1356, [LOOP.cx - LOOP.r, LOOP.cy + 70], LIN],
      [1392, [SHEET.menu[0], 2100]],
      [1430, [SHEET.menu[0], 2080], LIN],
      [D_CLICK, "end", OUT],
    ],
  ),
  // E：公開されたタイムテーブルから、DM の窓口へ（ゴール）
  leg("E", rounded([[PUB.cx, PUB.cy + PUB.h / 2], [PUB.cx, 2520], [6600, 2520], [6600, DM_END[1]], DM_END], 90), [
    [1490, 0],
    [1530, "end", IO],
  ]),
];

/* ─────────── カメラ：[フレーム, x, y, 倍率, 傾き(度), その区間の動き] ─────────── */
type CamKey = [number, number, number, number, number, Ease?];
const [hx, hy] = ST.hook;
export const CAM: CamKey[] = [
  [0, START[0], START[1], 2.3, 0],
  [16, START[0] + 40, START[1], 2.1, 0],
  [56, hx + 20, hy - 20, 1.0, 0, OUT],
  [104, hx + 40, hy - 20, 1.0, 0, LIN],
  [152, ST.pdf[0] + 20, ST.pdf[1] - 40, 1.0, 0],
  [252, ST.pdf[0] + 30, ST.pdf[1] - 40, 1.0, 0, LIN],
  [300, ST.points[0], ST.points[1], 1.0, 0],
  [420, ST.points[0] + 20, ST.points[1], 1.03, 0, LIN],
  [462, ST.basic[0], ST.basic[1], 1.0, 0],
  [722, ST.basic[0], ST.basic[1], 1.0, 0, LIN],
  [758, ST.map[0], ST.map[1], 1.12, 0],
  [D_ROUTE_END, ST.map[0], ST.map[1], 1.16, 0, LIN],
  [1075, ST.gap[0], ST.gap[1], 1.0, 0],
  [1211, ST.gap[0], ST.gap[1], 1.02, 0, LIN],
  [1252, ST.plus[0], ST.plus[1], 1.0, 0],
  [1360, ST.plus[0] + 10, ST.plus[1], 1.0, 0, LIN],
  [1396, ST.sheet[0], ST.sheet[1], 1.0, 0],
  [1500, ST.sheet[0] + 10, ST.sheet[1], 1.0, 0, LIN],
  [1536, ST.cta[0], ST.cta[1], 1.0, 0],
  [1690, ST.cta[0], ST.cta[1], 1.03, 0, LIN],
  [1740, 3380, 1800, 0.26, -2],
  [1780, 3380, 1800, 0.25, -2, LIN],
];

/** 区分ごとの補間 */
export const piecewise = (f: number, keys: [number, number, Ease][]): number => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i];
    const [f1, v1, e] = keys[i + 1];
    if (f < f1) return f1 <= f0 ? v1 : v0 + (v1 - v0) * e((f - f0) / (f1 - f0));
  }
  return keys[keys.length - 1][1];
};

/** 駅から駅への移動中だけ、わずかに傾けて引く（スピード感）：[開始, 終了, 傾き(度), 引き] */
const SWOOSH: [number, number, number, number][] = [
  [104, 152, -2.5, 0.14],
  [252, 300, 2.5, 0.14],
  [420, 462, -2, 0.12],
  [722, 758, 2, 0.12],
  [D_ROUTE_END, 1075, -2, 0.1],
  [1211, 1252, 2, 0.12],
  [1360, 1396, -2, 0.1],
  [1500, 1536, 2, 0.1],
];

const baseCamera = (f: number) => {
  if (f <= T(CAM[0][0])) return { x: CAM[0][1], y: CAM[0][2], s: CAM[0][3], r: CAM[0][4] };
  for (let i = 0; i < CAM.length - 1; i++) {
    const a = CAM[i];
    const b = CAM[i + 1];
    const fa = T(a[0]);
    const fb = T(b[0]);
    if (f < fb) {
      const t = fb <= fa ? 1 : (b[5] ?? IO)((f - fa) / (fb - fa));
      return {
        x: a[1] + (b[1] - a[1]) * t,
        y: a[2] + (b[2] - a[2]) * t,
        // 倍率は対数で補間（寄り・引きの速さが自然になる）
        s: Math.exp(Math.log(a[3]) + (Math.log(b[3]) - Math.log(a[3])) * t),
        r: a[4] + (b[4] - a[4]) * t,
      };
    }
  }
  const z = CAM[CAM.length - 1];
  return { x: z[1], y: z[2], s: z[3], r: z[4] };
};

export const cameraAt = (f: number) => {
  const c = baseCamera(f);
  for (const [da, db, rot, pull] of SWOOSH) {
    const a = T(da);
    const b = T(db);
    if (f > a && f < b) {
      const k = Math.sin((Math.PI * (f - a)) / (b - a));
      c.r += rot * k;
      c.s *= 1 - pull * k;
    }
  }
  return c;
};
