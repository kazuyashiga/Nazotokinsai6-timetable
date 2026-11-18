import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Rise, SlideChars } from "../components/Motion";
import { C, clamp, SANS } from "../theme";
import { cameraAt, T } from "./geo";
import { RouteLine } from "./Line";
import { BasicPhones, BasicTexts, GapStation, GapTexts, MapCaption, MapPhone } from "./PhoneStation";
import {
  Cta,
  Grid,
  HookTimeline,
  HookTitle,
  PdfStation,
  PdfTexts,
  PlusFill,
  PlusTexts,
  PointsCards,
  PointsTitle,
  Published,
  SheetStation,
  SheetTexts,
  StartDot,
} from "./Stations";

/** 奥の層：カメラの半分の速さで動く点の格子（奥行きを出す） */
const FarLayer: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: 12000,
      height: 9000,
      transformOrigin: "0 0",
      transform: `translate(960px, 540px) scale(${0.55 + s * 0.45}) translate(${-x * 0.5 - 1200}px, ${-y * 0.5 - 1200}px)`,
      backgroundImage: "radial-gradient(rgba(22,19,31,.13) 2.4px, transparent 2.6px)",
      backgroundSize: "120px 120px",
    }}
  />
);

/**
 * モーション版（約 67 秒・1920x1080・30fps・無音）
 * 1 枚の大きな時間割の上に場面を 3×3 に並べ、地図アプリのルートと同じ青い線 1 本で、開場からゴール（DM）までをつなぐ。
 * カメラは線を追ってカットなしで進み、最後に引いて全体の道のりを見せる。
 */
export const Film: React.FC = () => {
  const f = useCurrentFrame();
  const cam = cameraAt(f);
  const demoLabel = interpolate(f, [T(436), T(452), T(1206), T(1222)], [0, 1, 1, 0], clamp);
  const outro = interpolate(f, [T(1740), T(1756)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <FarLayer x={cam.x} y={cam.y} s={cam.s} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: `translate(960px, 540px) rotate(${cam.r}deg) scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >
        <Grid />
        <HookTimeline />
        <PdfStation />
        <PointsCards />
        <SheetStation />
        <PlusFill />
        <RouteLine />
        <StartDot />
        <HookTitle />
        <PdfTexts />
        <PointsTitle />
        <BasicPhones />
        <MapPhone />
        <GapStation />
        <RouteLine over />
        <BasicTexts />
        <MapCaption />
        <GapTexts />
        <PlusTexts />
        <SheetTexts />
        <Published />
        <Cta />
      </div>

      {/* 注記：枠なしの薄い灰色 */}
      <div style={{ position: "absolute", right: 48, bottom: 30, fontFamily: SANS, fontSize: 34, fontWeight: 700, color: "#a7a3b6", opacity: demoLabel }}>
        デモ画面（架空のイベント）
      </div>

      {/* 終わり：引いた全体の道のりの上に、見出し */}
      {outro > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              background: "rgba(246,245,249,.94)",
              borderRadius: 14,
              padding: "56px 84px",
              boxShadow: "0 30px 80px rgba(22,19,31,.22)",
              opacity: outro,
              scale: String(0.92 + 0.08 * outro),
              fontFamily: SANS,
              fontWeight: 900,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 92, color: C.ink, lineHeight: 1.25 }}>
              <SlideChars text="使いやすいタイムテーブル、" start={T(1744)} step={1.1} />
            </div>
            <div style={{ fontSize: 92, color: C.violet, lineHeight: 1.25 }}>
              <SlideChars text="できました。" start={T(1756)} />
            </div>
            <Rise start={T(1764)} style={{ marginTop: 34 }}>
              <span style={{ fontSize: 56, color: C.ink, background: C.yellow, padding: "8px 28px", borderRadius: 4 }}>ご相談は DM へ</span>
            </Rise>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
