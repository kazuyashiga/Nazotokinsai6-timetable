import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Phone } from "../components/Phone";
import { Rise } from "../components/Motion";
import { C, clamp, EASE, MONO, SANS } from "../theme";

/** 紙・PDF のタイムテーブル（コードで描いた架空の表。どこかの実在イベントではない） */
export const DenseTable: React.FC = () => {
  const cols = 9;
  const rows = 26;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#fbfbf8", padding: 10 }}>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 900, color: "#222", marginBottom: 6 }}>○○謎解きフェス タイムテーブル（PDF）</div>
      <div style={{ display: "grid", gridTemplateColumns: `34px repeat(${cols}, 1fr)`, gap: 1, background: "#bbb" }}>
        {Array.from({ length: (cols + 1) * rows }, (_, i) => {
          const r = Math.floor(i / (cols + 1));
          const c = i % (cols + 1);
          const filled = c > 0 && (r * 7 + c * 3) % 5 < 2;
          return (
            <div
              key={i}
              style={{
                height: 17,
                background: c === 0 ? "#eee" : filled ? ["#fde2e2", "#e0e7ff", "#dcfce7", "#fef3c7"][(r + c) % 4] : "#fff",
                fontFamily: MONO,
                fontSize: 6,
                color: "#333",
                overflow: "hidden",
                lineHeight: "8px",
                padding: 1,
              }}
            >
              {c === 0 ? `${10 + Math.floor(r / 3)}:${["00", "20", "40"][r % 3]}` : filled ? "謎解き公演タイトル 団体名 ¥2000" : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ISSUES = ["拡大しないと、読めない。", "ハシゴの組み立ては、お客さん任せ。", "時間の重なりに、気づけない。"];

/** 課題（5–12 秒）：PDF の表をピンチで拡大する苦行 → 課題 3 つに赤い打ち消し */
export const Problem: React.FC = () => {
  const f = useCurrentFrame();
  // ピンチ拡大・縮小・横移動を繰り返す
  const zoom = interpolate(f, [10, 40, 70, 95, 125, 150], [1, 2.6, 2.6, 1.5, 2.9, 1.8], { ...clamp, easing: EASE });
  const panX = interpolate(f, [40, 70, 125, 150], [0, -90, 40, -60], { ...clamp, easing: EASE });
  const panY = interpolate(f, [40, 70, 125, 150], [0, 60, -120, -40], { ...clamp, easing: EASE });
  const pinch = interpolate(f % 60, [0, 30, 60], [60, 120, 60]);
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: "absolute", left: 210, top: 72 }}>
        <Phone height={880}>
          <div style={{ position: "absolute", inset: 0, scale: String(zoom), translate: `${panX}px ${panY}px`, transformOrigin: "40% 30%" }}>
            <DenseTable />
          </div>
          {/* 2 本指のピンチ */}
          {[-1, 1].map((s) => (
            <div
              key={s}
              style={{
                position: "absolute",
                left: 255 + s * pinch,
                top: 400 - s * pinch * 0.6,
                width: 64,
                height: 64,
                marginLeft: -32,
                borderRadius: "50%",
                background: "rgba(22,19,31,.22)",
                border: "3px solid rgba(255,255,255,.9)",
                opacity: interpolate(f, [8, 16, 150, 165], [0, 1, 1, 0], clamp),
              }}
            />
          ))}
        </Phone>
      </div>

      <div style={{ position: "absolute", left: 840, top: 200, width: 1000, fontFamily: SANS, color: C.ink }}>
        <Rise start={6}>
          <div style={{ fontSize: 60, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>よくある、画像・PDF の表。</div>
        </Rise>
        <div style={{ marginTop: 40 }}>
          {ISSUES.map((t, i) => {
            const s = 30 + i * 26;
            const strike = interpolate(f, [150 + i * 6, 166 + i * 6], [0, 100], { ...clamp, easing: EASE });
            return (
              <Rise key={t} start={s} style={{ marginBottom: 30 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
                  <span style={{ fontFamily: MONO, fontSize: 52, fontWeight: 700, color: C.red, width: 44 }}>×</span>
                  <span style={{ position: "relative", fontSize: 62, fontWeight: 900, whiteSpace: "nowrap" }}>
                    {t}
                    <span style={{ position: "absolute", left: 0, top: "52%", height: 8, width: `${strike}%`, background: C.violet }} />
                  </span>
                </div>
              </Rise>
            );
          })}
        </div>
        <Rise start={172}>
          <div style={{ fontSize: 66, fontWeight: 900, color: C.violet, marginTop: 24, whiteSpace: "nowrap" }}>ぜんぶ、スマホで解決。</div>
        </Rise>
      </div>
    </AbsoluteFill>
  );
};
