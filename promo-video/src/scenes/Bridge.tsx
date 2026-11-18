import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Marker, Rise } from "../components/Motion";
import { C, clamp, EASE, SANS } from "../theme";

const ROWS = [
  { from: "スキマ提案・絞り込み", to: "回遊（＋1 公演）" },
  { from: "会場のルート案内", to: "迷わず次の公演へ" },
  { from: "SNS でシェア", to: "口コミ・認知" },
  { from: "URL で予定を共有", to: "友達同士の参加・交流" },
];

/** 主催にも（50–55 秒）：参加者側の機能 → 主催者側の効果（期待） */
export const Bridge: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: SANS, color: C.ink }}>
      <div style={{ position: "absolute", left: 150, top: 110 }}>
        <Rise start={0}>
          <div style={{ fontSize: 84, fontWeight: 900 }}>
            お客さんの＋1 は、<Marker start={16}>主催の＋1。</Marker>
          </div>
        </Rise>
      </div>
      {/* 誤解防止：読める大きさの札で「期待できる効果」と示す（数値の保証ではない） */}
      <Rise start={30} style={{ position: "absolute", left: 1060, top: 250 }}>
        <span style={{ fontSize: 48, fontWeight: 900, color: C.ink, background: C.yellow, padding: "4px 20px", borderRadius: 3 }}>期待できる効果</span>
      </Rise>
      <div style={{ position: "absolute", left: 150, top: 350, width: 1620 }}>
        {ROWS.map((r, i) => {
          const s = 18 + i * 12;
          const arrow = interpolate(f, [s + 8, s + 26], [0, 1], { ...clamp, easing: EASE });
          return (
            <Rise key={i} start={s} style={{ display: "flex", alignItems: "center", marginBottom: 30 }}>
              <div style={{ width: 640, fontSize: 52, fontWeight: 700, background: C.white, border: `3px solid ${C.ink}`, borderRadius: 4, padding: "18px 30px" }}>{r.from}</div>
              <div style={{ width: 240, height: 8, margin: "0 30px", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: 8, width: `${arrow * 100}%`, background: C.violet }} />
                <div
                  style={{
                    position: "absolute",
                    left: `calc(${arrow * 100}% - 4px)`,
                    top: -14,
                    width: 0,
                    height: 0,
                    borderTop: "18px solid transparent",
                    borderBottom: "18px solid transparent",
                    borderLeft: `26px solid ${C.violet}`,
                    opacity: arrow,
                  }}
                />
              </div>
              <div style={{ fontSize: 56, fontWeight: 900, color: C.violet, opacity: arrow }}>{r.to}</div>
            </Rise>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
