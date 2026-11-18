import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Rise, SlideChars } from "../components/Motion";
import { C, clamp, EASE, SANS } from "../theme";

const OFFERS = ["設定・URL 発行まで、導入をサポートします。", "会場マップの設定も、サポートに含めて対応。", "デザインや条件も、イベントに合わせてご相談。"];

/** ご相談（73–83 秒）：結論の言い直し → 提供内容 → 行動（DM） */
export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dm = spring({ frame: f - 190, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ background: C.violet, fontFamily: SANS, color: C.white }}>
      {/* 背景の時刻罫（明るさを抑えて） */}
      {Array.from({ length: 13 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: 96 + i * 144, top: 0, width: 1, height: 1016, background: "rgba(255,255,255,.08)" }} />
      ))}
      <div style={{ position: "absolute", left: 150, top: 110 }}>
        <div style={{ fontSize: 60, fontWeight: 700 }}>
          <SlideChars text="主催は、" start={4} />
        </div>
        <div style={{ fontSize: 132, fontWeight: 900, color: C.yellow, lineHeight: 1.15 }}>
          <SlideChars text="スプシに入れるだけ。" start={12} step={1.4} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 150, top: 430 }}>
        {OFFERS.map((o, i) => (
          <Rise key={o} start={60 + i * 16} style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 26 }}>
            <span style={{ width: 18, height: 18, background: C.yellow, rotate: "45deg", display: "inline-block" }} />
            <span style={{ fontSize: 58, fontWeight: 900 }}>{o}</span>
          </Rise>
        ))}
      </div>
      {/* 行動：DM（アカウント名は出さない。投稿したアカウント自体が窓口） */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 760,
          display: "flex",
          alignItems: "center",
          gap: 28,
          background: C.yellow,
          color: C.ink,
          borderRadius: 6,
          padding: "26px 44px",
          scale: String(0.8 + 0.2 * dm),
          opacity: dm,
          transformOrigin: "0 50%",
          boxShadow: "0 16px 40px rgba(0,0,0,.25)",
        }}
      >
        <svg width="64" height="48" viewBox="0 0 64 48">
          <rect x="3" y="3" width="58" height="42" rx="4" fill="none" stroke={C.ink} strokeWidth="6" />
          <path d="M5 7 L32 28 L59 7" fill="none" stroke={C.ink} strokeWidth="6" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 64, fontWeight: 900 }}>導入のご相談は、このアカウントの DM まで。</span>
      </div>
      {/* 右側：ポスターの小さな列（このタイムテーブルで並ぶもの） */}
      <div style={{ position: "absolute", right: 96, top: 140, display: "grid", gridTemplateColumns: "repeat(2, 150px)", gap: 18, opacity: interpolate(f, [30, 60], [0, 0.95], { ...clamp, easing: EASE }) }}>
        {["04_fes", "01_hard", "03_party", "06_cafe"].map((p, i) => (
          <Img key={p} src={staticFile(`posters/${p}.jpg`)} style={{ width: 150, borderRadius: 3, rotate: `${[-3, 2, 3, -2][i]}deg`, boxShadow: "0 10px 24px rgba(0,0,0,.3)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** エンドカード（83–86 秒） */
export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: SANS, color: C.ink, justifyContent: "center", paddingLeft: 150 }}>
      <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.2 }}>
        <SlideChars text="使いやすいタイムテーブル、" start={0} step={1.1} />
        <br />
        <span style={{ color: C.violet }}>
          <SlideChars text="できました。" start={14} />
        </span>
      </div>
      <div style={{ marginTop: 48, opacity: interpolate(f, [24, 40], [0, 1], clamp) }}>
        <span style={{ fontSize: 64, fontWeight: 900, color: C.ink, background: C.yellow, padding: "6px 26px", borderRadius: 3 }}>ご相談は DM へ</span>
      </div>
    </AbsoluteFill>
  );
};
