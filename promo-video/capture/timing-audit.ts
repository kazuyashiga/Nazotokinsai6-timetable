/**
 * モーション版（Film）の「読む時間」の点検。
 *   npx tsx capture/timing-audit.ts
 *
 * 各文字のかたまりについて、全部出そろってから（カメラが離れる・消える・打ち消されるまで）の秒数と、
 * 読むのに要る秒数を比べる。要る秒数 = 反応 0.5 秒 + 文字数 ÷ 読む速さ（＋実機の画面も見る所は 0.5 秒）。
 * 読む速さ（仮定）：日本語字幕の目安 1 秒 4 文字を基準に、大きな見出しほど速く読めるとして
 *   100px 以上 7 文字/秒、60〜99px 6 文字/秒、46〜59px 5 文字/秒、45px 以下 4 文字/秒。
 */
import { getPointAtLength } from "@remotion/paths";
import { BASIC_WIN, cameraAt, CLICK, FILM_FRAMES, GAP_CLIP, LEGS, PDF, piecewise, POINT_CENTERS, POINTS, ROUTE_END, T, LOOP, SHEET, DM_END, PHONE, GAP_PHONE } from "../src/film/geo";

const FPS = 30;
const legA = LEGS[0];
const head = (f: number) => getPointAtLength(legA.d, Math.max(0, Math.min(legA.total, piecewise(f, legA.keys)))) ?? { x: 0, y: 0 };
const pass = (from: number, to: number, ok: (p: { x: number; y: number }) => boolean) => {
  for (let f = from; f <= to; f++) if (ok(head(f))) return f;
  return to;
};
const rate = (px: number) => (px >= 100 ? 7 : px >= 60 ? 6 : px >= 46 ? 5 : 4);

type Block = { name: string; box: [number, number, number, number]; parts: [number, number][]; appear: number; end?: number; watch?: boolean };
const W = (n: number, px: number) => n * px;

// 開場の見出し：最後の文字が線から立ち上がって落ち着くまで
const titleFull = (() => {
  let last = 0;
  const lines = ["使いやすい", "タイムテーブル、", "できました。"];
  lines.forEach((l, li) => [...l].forEach((_, i) => {
    const x = 160 + i * 132 + 66;
    last = Math.max(last, Math.max(T(16) + li * 3, pass(T(0), T(110), (p) => p.x >= x) + li * 2));
  }));
  return last + 20;
})();
const CUT = pass(T(190), T(230), (p) => p.y > 1690 && p.x <= PDF.x + PDF.w / 2);
const CARD_AT = POINT_CENTERS.map((cx) => pass(T(300), T(420), (p) => p.y < POINTS.railY + 5 && p.x >= cx - 40));
const gapAt = (sec: number) => Math.round(GAP_CLIP.start + (sec - GAP_CLIP.from) * 30);
const PLUS_AT = T(1290);
const px = LOOP.cx + LOOP.r + 80;

const blocks: Block[] = [
  { name: "開場：見出し（使いやすい…）", box: [160, 222, 1216, 654], parts: [[16, 132]], appear: titleFull },
  { name: "開場：主催者さまへ", box: [160, 110, 888, 194], parts: [[13, 56]], appear: T(48) },
  { name: "課題：よくある、画像・PDF の表。", box: [1080, 1440, 1782, 1521], parts: [[13, 54]], appear: T(158) },
  { name: "課題：× 3 行（打ち消しまで）", box: [1080, 1780, 1080 + W(17, 46) + 56, 2010], parts: [[39, 46]], appear: T(168), end: CUT + 4 },
  { name: "課題：ぜんぶ、スマホで。", box: [150, 1562, 1140, 1683], parts: [[9, 110]], appear: CUT + 31 },
  { name: "いいところ：見出し", box: [200, 2700, 1208, 2826], parts: [[12, 84]], appear: T(306) },
  ...[18, 19, 15].map((n, i) => ({ name: `いいところ：カード ${i + 1}`, box: [POINTS.cardX + i * 554, POINTS.cardY, POINTS.cardX + i * 554 + 512, POINTS.cardY + 460] as [number, number, number, number], parts: [[n, 64]] as [number, number][], appear: CARD_AT[i] + 15 })),
  { name: "基本機能：見出し", box: [2520, 2662, 3356, 2776], parts: [[11, 76]], appear: T(458) },
  ...[12, 12, 13].map((n, i) => ({ name: `基本機能：説明 ${["選ぶ", "絞る", "共有"][i]}`, box: [2524, 2760, 2524 + W(n, 50), 2835] as [number, number, number, number], parts: [[n, 50]] as [number, number][], appear: BASIC_WIN[i][0] + 18, end: BASIC_WIN[i][1] + 6, watch: true })),
  { name: "地図：次の部屋／場所まで…", box: [PHONE.cx + 480, 1520, PHONE.cx + 480 + 640, 1700], parts: [[19, 64]], appear: T(782), end: ROUTE_END - 6, watch: true },
  { name: "スキマ：札＋見出し", box: [3390, GAP_PHONE.cy - 330, 3390 + 784, GAP_PHONE.cy - 330 + 360], parts: [[11, 42], [13, 112]], appear: T(1088) },
  { name: "スキマ：“もうひとつ”が増える", box: [3390, GAP_PHONE.cy + 60, 3390 + W(17, 50), GAP_PHONE.cy + 140], parts: [[17, 50]], appear: gapAt(5.4) + 18, watch: true },
  { name: "＋1：お客さんの＋1 は、主催の＋1。", box: [px, 100, px + 720, 330], parts: [[10, 72], [6, 96]], appear: PLUS_AT + 28 },
  { name: "＋1：期待できる効果（4 行）", box: [px, 372, px + 1000, 870], parts: [[7, 40], [66, 40]], appear: PLUS_AT + 48 },
  { name: "スプシ：主催は、…ボタンを押すだけ。", box: [SHEET.x, 1400, SHEET.x + 1360, 1610], parts: [[4, 56], [17, 80]], appear: T(1402) },
  { name: "スプシ：押す → 立ち上がる", box: [SHEET.x, 1400, SHEET.x + 1360, 2300], parts: [], appear: CLICK, watch: true },
  { name: "ゴール：3 行", box: [5000, 2770, 5000 + 1300, 3050], parts: [[64, 56]], appear: T(1540) },
  { name: "ゴール：DM の窓口", box: [DM_END[0] - 1420, DM_END[1] - 75, DM_END[0], DM_END[1] + 75], parts: [[21, 60]], appear: T(1552) },
  { name: "終わり：見出し＋ご相談は DM へ", box: [0, 0, 1920, 1080], parts: [[19, 92], [8, 56]], appear: T(1775), end: FILM_FRAMES },
];

const inView = (f: number, [x0, y0, x1, y1]: number[], screen = false) => {
  if (screen) return true;
  const c = cameraAt(f);
  const sx = (x: number) => 960 + (x - c.x) * c.s;
  const sy = (y: number) => 540 + (y - c.y) * c.s;
  return sx(x0) >= -4 && sx(x1) <= 1924 && sy(y0) >= -4 && sy(y1) <= 1084;
};

console.log(`全体 ${(FILM_FRAMES / FPS).toFixed(1)} 秒\n`);
console.log("判定  出る(秒)  見える  要る   かたまり");
for (const b of blocks) {
  const screen = b.name.startsWith("終わり");
  let exit = b.end ?? FILM_FRAMES;
  for (let f = b.appear; f < exit; f++) if (!inView(f, b.box, screen)) { exit = f; break; }
  const avail = (exit - b.appear) / FPS;
  const need = b.parts.length ? 0.5 + b.parts.reduce((a, [n, p]) => a + n / rate(p), 0) + (b.watch ? 0.5 : 0) : 2.0;
  const r = avail / need;
  const tag = r < 0.85 ? "短い" : r > 1.8 ? "長い" : " 可 ";
  console.log(`${tag}  ${(b.appear / FPS).toFixed(1).padStart(5)}   ${avail.toFixed(1).padStart(5)}  ${need.toFixed(1).padStart(4)}   ${b.name}`);
}
