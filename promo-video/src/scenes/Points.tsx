import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Rise } from "../components/Motion";
import { C, clamp, SANS } from "../theme";

const CARDS = [
  { head: "見やすい。\n選びやすい。\n迷わない。", sub: "スマホでハシゴ計画・会場のルート案内", bg: C.violet, fg: C.white, chip: C.yellow, tag: "参加者" },
  { head: "＋1 公演が\n増える仕組み。", sub: "スキマ提案・絞り込み・共有", bg: C.yellow, fg: C.ink, chip: C.violet, tag: "参加者 → 主催" },
  { head: "主催は\nスプシに\n入れるだけ。", sub: "設定・公開までボタンひとつ", bg: C.ink, fg: C.white, chip: C.yellow, tag: "主催" },
];

/** 要点（12–16 秒）：3 枚のカードが順に表へ返る */
export const Points: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: "absolute", left: 150, top: 90, fontFamily: SANS }}>
        <Rise start={0}>
          <div style={{ fontSize: 84, fontWeight: 900, color: C.ink }}>この 3 つが、いいところ。</div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 150, top: 300, display: "flex", gap: 42, perspective: 1600 }}>
        {CARDS.map((c, i) => {
          const flip = spring({ frame: f - 10 - i * 10, fps, config: { damping: 16, stiffness: 110 } });
          return (
            <div
              key={i}
              style={{
                width: 512,
                height: 460,
                borderRadius: 6,
                background: c.bg,
                color: c.fg,
                padding: "48px 44px",
                rotate: `y ${(1 - flip) * -90}deg`,
                opacity: interpolate(flip, [0, 0.2], [0, 1], clamp),
                boxShadow: "0 18px 40px rgba(22,19,31,.18)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                fontFamily: SANS,
              }}
            >
              <div style={{ fontFamily: SANS, fontSize: 48, fontWeight: 900, color: c.chip, letterSpacing: "0.04em" }}>{c.tag}</div>
              <div style={{ fontSize: 66, fontWeight: 900, lineHeight: 1.25, whiteSpace: "pre" }}>{c.head}</div>
              <div />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
