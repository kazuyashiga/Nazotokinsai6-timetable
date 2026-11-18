import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Footage, Phone } from "../components/Phone";
import { Marker, Rise, SlideChars } from "../components/Motion";
import { C, clamp, EASE, SANS } from "../theme";

const POSTERS = ["04_fes", "03_party", "02_beginner", "01_hard", "06_cafe", "07_walk", "05_meta"];

/** 開場（0–5 秒）：7 枚のポスターが列に着地 → スマホの画面へ吸い込まれ、実機が立ち上がる */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pw = 176;
  const ph = Math.round(pw * 1.413);
  const gap = 24;
  const rowW = POSTERS.length * pw + (POSTERS.length - 1) * gap;
  const rowX = (1920 - rowW) / 2;
  const rowY = 300;
  // スマホの位置（右側）
  const phoneH = 880;
  const phoneX = 1150;
  const phoneY = 72;
  const gather = interpolate(f, [30, 54], [0, 1], { ...clamp, easing: EASE });
  const phoneIn = spring({ frame: f - 40, fps, config: { damping: 18, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {/* 背景：時刻の縦罫（タイムテーブルの列） */}
      {Array.from({ length: 13 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: 96 + i * 144, top: 0, width: 1, height: 1016, background: C.line, opacity: 0.6 }} />
      ))}

      {/* ポスター：列に着地 → スマホへ集まる */}
      {POSTERS.map((p, i) => {
        const land = spring({ frame: f + 7 - i * 3, fps, config: { damping: 14, stiffness: 140 } });
        const fromY = i % 2 ? -420 : 1300;
        const x0 = rowX + i * (pw + gap);
        const x1 = phoneX + 300 - pw / 2;
        const y1 = phoneY + 360;
        const x = x0 + (x1 - x0) * gather;
        const y = interpolate(land, [0, 1], [fromY, rowY]) + (y1 - rowY) * gather;
        return (
          <Img
            key={p}
            src={staticFile(`posters/${p}.jpg`)}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: pw,
              height: ph,
              borderRadius: 4,
              boxShadow: "0 10px 24px rgba(22,19,31,.22)",
              rotate: `${(1 - land) * (i % 2 ? -14 : 12) + gather * (i - 3) * 4}deg`,
              scale: String(1 - gather * 0.45),
              opacity: 1 - interpolate(f, [46, 58], [0, 1], clamp),
            }}
          />
        );
      })}

      {/* 実機：browse を再生 */}
      <div style={{ position: "absolute", left: phoneX, top: phoneY, scale: String(0.6 + 0.4 * phoneIn), opacity: phoneIn }}>
        <Phone height={phoneH}>
          <Footage clip="browse" />
        </Phone>
      </div>

      {/* 見出し */}
      <div style={{ position: "absolute", left: 150, top: 280, width: 940, color: C.ink, fontFamily: SANS }}>
        <Rise start={38}>
          <div style={{ fontSize: 56, fontWeight: 900, color: C.violet, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>謎解きイベントの主催者さまへ</div>
        </Rise>
        <div style={{ fontSize: 124, fontWeight: 900, lineHeight: 1.18, marginTop: 28, letterSpacing: "-0.01em" }}>
          <div><SlideChars text="使いやすい" start={44} /></div>
          <div><SlideChars text="タイムテーブル、" start={52} /></div>
          <div>
            <Marker start={80}>
              <SlideChars text="できました。" start={64} />
            </Marker>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
