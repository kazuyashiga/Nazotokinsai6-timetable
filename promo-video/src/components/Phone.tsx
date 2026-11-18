import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, EASE } from "../theme";

import browse from "../../public/footage/browse.json";
import select from "../../public/footage/select.json";
import gap from "../../public/footage/gap.json";
import filter from "../../public/footage/filter.json";
import detail from "../../public/footage/detail.json";
import ticket from "../../public/footage/ticket.json";
import shared from "../../public/footage/shared.json";
import route from "../../public/footage/route.json";

/** 収録した実機素材（?mock=1 を iPhone 13 相当で操作したもの）。taps は CSS px（390x664）と秒 */
export const CLIPS = { browse, select, gap, filter, detail, ticket, shared, route } as const;
export type ClipName = keyof typeof CLIPS;

/** 画面の縦横比（iPhone 13 の表示領域 390x664） */
export const SCREEN_RATIO = 390 / 664;

/** スマホの枠。メーカーを想起させる意匠（ノッチ・ボタン）は描かない */
export const Phone: React.FC<{ height: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ height, children, style }) => {
  const bezel = Math.round(height * 0.022);
  const screenH = height - bezel * 2;
  const screenW = Math.round(screenH * SCREEN_RATIO);
  return (
    <div
      style={{
        width: screenW + bezel * 2,
        height,
        borderRadius: bezel * 3.2,
        background: C.ink,
        padding: bezel,
        boxShadow: "0 30px 60px rgba(22,19,31,.28), 0 8px 18px rgba(22,19,31,.18)",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: screenW, height: screenH, borderRadius: bezel * 2.2, overflow: "hidden", background: C.white }}>
        {children}
      </div>
    </div>
  );
};

/**
 * 実機素材を再生し、記録したタップ位置に波紋を重ねる。
 * from: 素材の何秒目から使うか、seconds: 何秒使うか
 */
export const Footage: React.FC<{ clip: ClipName; from?: number; zoom?: { at: number; to: number; scale: number; x: number; y: number }[] }> = ({ clip, from = 0, zoom = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const meta = CLIPS[clip];
  const t = frame / fps + from;

  // 要所のズーム：at〜to 秒の間、(x, y)（CSS px）を中心に拡大する
  let scale = 1;
  let ox = 195;
  let oy = 332;
  for (const z of zoom) {
    const k = interpolate(t, [z.at, z.at + 0.45, z.to - 0.45, z.to], [0, 1, 1, 0], { ...clamp, easing: EASE });
    if (k > 0) {
      scale = 1 + (z.scale - 1) * k;
      ox = z.x;
      oy = z.y;
    }
  }

  return (
    <AbsoluteFill style={{ scale: String(scale), transformOrigin: `${(ox / 390) * 100}% ${(oy / 664) * 100}%` }}>
      <Video src={staticFile(`footage/${clip}.mp4`)} trimBefore={Math.round(from * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {meta.taps.map((tap, i) => {
        const dt = t - tap.t;
        // 使う区間（from 以降）より前のタップの波紋は出さない（区間の頭に消えかけの波紋が残るため）
        if (tap.t < from || dt < -0.05 || dt > 0.75) return null;
        const p = interpolate(dt, [-0.05, 0.75], [0, 1], clamp);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(tap.x / 390) * 100}%`,
              top: `${(tap.y / 664) * 100}%`,
              width: 90,
              height: 90,
              marginLeft: -45,
              marginTop: -45,
              borderRadius: "50%",
              border: `6px solid ${C.yellow}`,
              background: "rgba(250,204,21,.25)",
              scale: String(interpolate(p, [0, 1], [0.35, 1.5], { easing: EASE })),
              opacity: interpolate(p, [0, 0.15, 1], [0, 1, 0]),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
