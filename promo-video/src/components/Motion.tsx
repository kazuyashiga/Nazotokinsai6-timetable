import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, clamp, EASE, EASE_IN, MONO, SANS, SCENES, TOTAL, W } from "../theme";

/** start フレームで下から立ち上がり、end フレームで上へ抜ける（行単位の出入り） */
export const Rise: React.FC<{ start: number; end?: number; dist?: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  start,
  end,
  dist = 40,
  dur = 18,
  children,
  style,
}) => {
  const f = useCurrentFrame();
  const inP = interpolate(f, [start, start + dur], [0, 1], { ...clamp, easing: EASE });
  const outP = end === undefined ? 0 : interpolate(f, [end, end + 12], [0, 1], { ...clamp, easing: EASE_IN });
  return (
    <div style={{ opacity: inP * (1 - outP), translate: `0px ${(1 - inP) * dist - outP * dist * 0.6}px`, ...style }}>{children}</div>
  );
};

/** 文字列を 1 文字ずつ、マスクの下からせり上げる（見出し用） */
export const SlideChars: React.FC<{ text: string; start: number; step?: number; style?: React.CSSProperties }> = ({ text, start, step = 1.6, style }) => {
  const f = useCurrentFrame();
  return (
    <span style={{ display: "inline-block", whiteSpace: "pre", ...style }}>
      {[...text].map((ch, i) => {
        const p = interpolate(f, [start + i * step, start + i * step + 14], [0, 1], { ...clamp, easing: EASE });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
            <span style={{ display: "inline-block", translate: `0px ${(1 - p) * 105}%` }}>{ch}</span>
          </span>
        );
      })}
    </span>
  );
};

/** 蛍光ペンの下線（左から伸びる） */
export const Marker: React.FC<{ start: number; color?: string; children: React.ReactNode }> = ({ start, color = C.yellow, children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [start, start + 14], [0, 100], { ...clamp, easing: EASE });
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${color}, ${color})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${p}% 34%`,
        backgroundPosition: "0 88%",
        padding: "0 0.06em",
      }}
    >
      {children}
    </span>
  );
};

/**
 * 見せ場：動画そのものを 1 本のタイムテーブルに見立てた時刻の目盛り（10:00 → 18:00）。
 * 場面を「公演枠」として並べ、いまの場面の枠を選択中の色にする。
 */
const SLOTS: { key: keyof typeof SCENES; label: string }[] = [
  { key: "hook", label: "開場" },
  { key: "problem", label: "課題" },
  { key: "points", label: "要点" },
  { key: "demo", label: "参加者の体験" },
  { key: "venue", label: "会場マップ" },
  { key: "bridge", label: "主催にも" },
  { key: "organizer", label: "主催の設定" },
  { key: "cta", label: "ご相談" },
  { key: "end", label: "" },
];

export const Ruler: React.FC = () => {
  const f = useCurrentFrame();
  const left = 96;
  const width = W - left * 2;
  const x = (frame: number) => left + (frame / TOTAL) * width;
  let acc = 0;
  const slots = SLOTS.map((s) => {
    const from = acc;
    acc += SCENES[s.key];
    return { ...s, from, to: acc };
  });
  const show = interpolate(f, [8, 30, TOTAL - 70, TOTAL - 50], [0, 1, 1, 0], clamp);
  const ticks = Array.from({ length: 17 }, (_, i) => i); // 10:00〜18:00 を 30 分刻み
  return (
    <div style={{ position: "absolute", left: 0, top: 1080 - 64, width: W, height: 64, opacity: show, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(22,19,31,.94)" }} />
      {slots.filter((s) => s.label).map((s) => {
        const active = f >= s.from && f < s.to;
        return (
          <div
            key={s.key}
            style={{
              position: "absolute",
              left: x(s.from) + 3,
              width: x(s.to) - x(s.from) - 6,
              top: 10,
              height: 22,
              borderRadius: 3,
              background: active ? C.violet : "rgba(255,255,255,.08)",
              outline: active ? `2px solid ${C.yellow}` : "none",
              color: active ? C.yellow : "rgba(255,255,255,.5)",
              fontFamily: SANS,
              fontSize: 15,
              fontWeight: 700,
              lineHeight: "22px",
              paddingLeft: 8,
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </div>
        );
      })}
      {ticks.map((i) => (
        <div key={i} style={{ position: "absolute", left: left + (i / 16) * width, top: 38, width: 1, height: i % 2 ? 6 : 10, background: "rgba(255,255,255,.4)" }}>
          {i % 2 === 0 && (
            <span style={{ position: "absolute", top: 10, left: -24, width: 48, textAlign: "center", fontFamily: MONO, fontSize: 13, color: "rgba(255,255,255,.55)" }}>
              {`${10 + i / 2}:00`}
            </span>
          )}
        </div>
      ))}
      <div style={{ position: "absolute", left: x(f) - 1, top: 4, width: 3, height: 56, background: C.yellow }} />
    </div>
  );
};
