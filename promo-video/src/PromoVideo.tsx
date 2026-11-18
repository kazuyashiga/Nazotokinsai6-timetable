import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { Ruler } from "./components/Motion";
import { Bridge } from "./scenes/Bridge";
import { Cta, EndCard } from "./scenes/Cta";
import { Demo, Venue } from "./scenes/Demo";
import { Hook } from "./scenes/Hook";
import { Organizer } from "./scenes/Organizer";
import { Points } from "./scenes/Points";
import { Problem } from "./scenes/Problem";
import { SCENES } from "./theme";

/** 主催者向け PR 動画（約 86 秒・1920x1080・30fps・無音） */
export const PromoVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#f6f5f9" }}>
    <Series>
      <Series.Sequence name="開場" durationInFrames={SCENES.hook}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence name="課題" durationInFrames={SCENES.problem}>
        <Problem />
      </Series.Sequence>
      <Series.Sequence name="要点" durationInFrames={SCENES.points}>
        <Points />
      </Series.Sequence>
      <Series.Sequence name="参加者の体験" durationInFrames={SCENES.demo}>
        <Demo />
      </Series.Sequence>
      <Series.Sequence name="会場マップ" durationInFrames={SCENES.venue}>
        <Venue />
      </Series.Sequence>
      <Series.Sequence name="主催にも" durationInFrames={SCENES.bridge}>
        <Bridge />
      </Series.Sequence>
      <Series.Sequence name="主催の設定" durationInFrames={SCENES.organizer}>
        <Organizer />
      </Series.Sequence>
      <Series.Sequence name="ご相談" durationInFrames={SCENES.cta}>
        <Cta />
      </Series.Sequence>
      <Series.Sequence name="エンド" durationInFrames={SCENES.end}>
        <EndCard />
      </Series.Sequence>
    </Series>
    <Ruler />
  </AbsoluteFill>
);
