import React from "react";
import { Composition, Folder } from "remotion";
import { PromoVideo } from "./PromoVideo";
import { Film } from "./film/Film";
import { FILM_FRAMES } from "./film/geo";
import { Bridge } from "./scenes/Bridge";
import { Cta, EndCard } from "./scenes/Cta";
import { Demo, Venue } from "./scenes/Demo";
import { Hook } from "./scenes/Hook";
import { Organizer } from "./scenes/Organizer";
import { Points } from "./scenes/Points";
import { Problem } from "./scenes/Problem";
import { FPS, H, SCENES, TOTAL, W } from "./theme";

const scene = (id: string, component: React.FC, frames: number) => (
  <Composition id={id} component={component} durationInFrames={frames} fps={FPS} width={W} height={H} />
);

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Scenes">
      {scene("Hook", Hook, SCENES.hook)}
      {scene("Problem", Problem, SCENES.problem)}
      {scene("Points", Points, SCENES.points)}
      {scene("Demo", Demo, SCENES.demo)}
      {scene("Venue", Venue, SCENES.venue)}
      {scene("Bridge", Bridge, SCENES.bridge)}
      {scene("Organizer", Organizer, SCENES.organizer)}
      {scene("Cta", Cta, SCENES.cta)}
      {scene("EndCard", EndCard, SCENES.end)}
    </Folder>
    <Composition id="PromoVideo" component={PromoVideo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="Film" component={Film} durationInFrames={FILM_FRAMES} fps={FPS} width={W} height={H} />
  </>
);
