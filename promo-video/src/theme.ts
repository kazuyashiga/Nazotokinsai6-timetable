import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

/**
 * 書体はアプリと同じ Zen Kaku Gothic New（題字・本文）と JetBrains Mono（時刻・ラベル）。
 * 日本語フォントは全分割を読むと書き出しが時間切れになるため、動画内の文字だけを含む
 * サブセット（capture/fetch_fonts.py で取得）をローカルから読む。文言を変えたら再取得する。
 */
export const SANS = "Zen Kaku Gothic New";
export const MONO = "JetBrains Mono";
for (const w of ["500", "700", "900"]) {
  loadFont({ family: SANS, url: staticFile(`fonts/zen-${w}.woff2`), weight: w, format: "woff2" });
}
for (const w of ["500", "700"]) {
  loadFont({ family: MONO, url: staticFile(`fonts/mono-${w}.woff2`), weight: w, format: "woff2" });
}

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** 配色：アプリのデフォルト（タイムテーブルメインカラー／アクセントカラー）から導出 */
export const C = {
  violet: "#5b21b6", // メイン
  violetDeep: "#2e1065", // 暗い面
  yellow: "#facc15", // アクセント
  ink: "#16131f", // 文字
  paper: "#f6f5f9", // 背景（わずかに紫寄りの白）
  line: "#d9d6e3", // 罫線
  sub: "#5c5670", // 補足文字
  red: "#dc2626", // 警告（アプリの重複警告と同系）
  white: "#ffffff",
};

/** 動きの基本カーブ（素早く出て、静かに止まる） */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 場面の長さ（フレーム）。合計 86 秒 = 2580 フレーム */
export const SCENES = {
  hook: 150,
  problem: 210,
  points: 120,
  demo: 720,
  venue: 300,
  bridge: 150,
  organizer: 540,
  cta: 300,
  end: 90,
} as const;
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0);
