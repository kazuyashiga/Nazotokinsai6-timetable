import { getPointAtLength } from "@remotion/paths";
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { clamp } from "../theme";
import { Leg, LEGS, piecewise } from "./geo";

/** 地図アプリのルートと同じ色（アプリ本体の --route-core / --route-edge） */
export const ROUTE = { core: "#1a73e8", edge: "#185abc", halo: "rgba(26,115,232,.16)" };

/** 世界全体を覆う SVG の範囲（世界座標） */
export const WORLD_BOX = { x: -1200, y: -1200, w: 9600, h: 6600 };

const LegPath: React.FC<{ leg: Leg }> = ({ leg }) => {
  const f = useCurrentFrame();
  const len = Math.min(leg.total, piecewise(f, leg.keys));
  if (len <= 0.5) return null;
  const opacity = leg.fade ? interpolate(f, leg.fade, [1, 0], clamp) : 1;
  if (opacity <= 0) return null;
  const dash = `${len} ${leg.total + 10}`;
  const id = `flow-${leg.id}`;
  const moving = len < leg.total - 0.5;
  const head = moving ? getPointAtLength(leg.d, len) ?? null : null;
  return (
    <g opacity={opacity}>
      <mask id={id} maskUnits="userSpaceOnUse" x={WORLD_BOX.x} y={WORLD_BOX.y} width={WORLD_BOX.w} height={WORLD_BOX.h}>
        <path d={leg.d} fill="none" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeDasharray={dash} />
      </mask>
      <path d={leg.d} fill="none" stroke={ROUTE.halo} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      <path d={leg.d} fill="none" stroke={ROUTE.edge} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      <path d={leg.d} fill="none" stroke={ROUTE.core} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      {/* 進む向きに流れる白い点（アプリのルートと同じ表現） */}
      <path
        d={leg.d}
        fill="none"
        stroke="#fff"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray="0.1 30"
        strokeDashoffset={-f * 2.2}
        mask={`url(#${id})`}
        opacity={0.95}
      />
      {/* 線の頭：光の玉 */}
      {head && (
        <g transform={`translate(${head.x} ${head.y})`}>
          <circle r={46 + Math.sin(f / 3) * 4} fill="rgba(26,115,232,.18)" />
          <circle r={24} fill="rgba(255,255,255,.85)" />
          <circle r={12} fill="#fff" stroke={ROUTE.core} strokeWidth={5} />
        </g>
      )}
    </g>
  );
};

/** 全編をつなぐ 1 本の線。over=true の区間だけを描く層と、それ以外の層に分ける */
export const RouteLine: React.FC<{ over?: boolean }> = ({ over = false }) => (
  <svg
    style={{ position: "absolute", left: WORLD_BOX.x, top: WORLD_BOX.y, width: WORLD_BOX.w, height: WORLD_BOX.h, overflow: "visible", pointerEvents: "none" }}
    viewBox={`${WORLD_BOX.x} ${WORLD_BOX.y} ${WORLD_BOX.w} ${WORLD_BOX.h}`}
  >
    {LEGS.filter((l) => Boolean(l.over) === over).map((l) => (
      <LegPath key={l.id} leg={l} />
    ))}
  </svg>
);
