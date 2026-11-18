import React from "react";
import { AbsoluteFill, Series, interpolate, useCurrentFrame } from "remotion";
import { ClipName, Footage, Phone } from "../components/Phone";
import { Marker, Rise } from "../components/Motion";
import { C, clamp, EASE, SANS } from "../theme";

type Beat = { at: number; head: React.ReactNode };
type Seg = { clip: ClipName; from: number; frames: number; chip: string; badge?: string; beats: Beat[]; zoom?: { at: number; to: number; scale: number; x: number; y: number }[] };

/**
 * 参加者の体験（16–40 秒）：実機の操作を 4 つつなぐ。字幕はタップの瞬間（素材の秒）に合わせる。
 * 素材：select / gap / filter / ticket（すべて ?mock=1 の実際の操作）
 */
const SEGS: Seg[] = [
  {
    clip: "select",
    from: 0,
    frames: 192,
    chip: "選ぶ",
    beats: [
      { at: 0.6, head: <>時間枠を<br /><Marker start={20}>タップするだけ。</Marker></> },
      { at: 4.1, head: <>時間が重なったら、<br /><span style={{ color: C.red }}>その場で警告。</span></> },
    ],
    zoom: [{ at: 4.4, to: 6.4, scale: 1.32, x: 195, y: 600 }],
  },
  {
    clip: "gap",
    from: 1.6,
    frames: 200,
    chip: "提案",
    beats: [
      { at: 1.9, head: <>空き時間に入る公演を、<br /><Marker start={14}>自動で提案。</Marker></> },
      { at: 6.1, head: <>お客さんの<br /><Marker start={142}>“もうひとつ”</Marker>が増える。</> },
    ],
    zoom: [{ at: 3.3, to: 6.0, scale: 1.3, x: 195, y: 230 }],
  },
  {
    clip: "filter",
    from: 0,
    frames: 138,
    chip: "絞る",
    beats: [{ at: 0.2, head: <>難易度・タグで<br /><Marker start={16}>絞り込み。</Marker></> }],
  },
  {
    clip: "ticket",
    from: 2.0,
    frames: 190,
    chip: "共有",
    beats: [
      { at: 2.1, head: <>予定は、<br /><Marker start={12}>チケット画像</Marker>に。</> },
      { at: 7.3, head: <>SNS・URL で、<br />そのまま共有。</> },
    ],
  },
];

/**
 * 会場マップ（40–50 秒）：予定一覧の「ルートを見る」→ 1 階の全体 →「拡大」→「2階へ」で 2 階へ。
 * 素材：route（?mock=1 のサンプル会館。実際の操作）
 */
const VENUE_SEGS: Seg[] = [
  {
    clip: "route",
    from: 1.2,
    frames: 300,
    chip: "案内",
    badge: "新機能",
    beats: [
      { at: 1.25, head: <>次の部屋まで、<br /><Marker start={16}>地図でルート案内。</Marker></> },
      { at: 5.25, head: <>流れる線で、<br />進む向きがひと目で。</> },
      { at: 7.95, head: <>階段は番号で、<br /><Marker start={210}>上の階へつながる。</Marker></> },
    ],
  },
];

const Caption: React.FC<{ seg: Seg }> = ({ seg }) => {
  const f = useCurrentFrame();
  const t = f / 30 + seg.from;
  const idx = seg.beats.reduce((acc, b, i) => (t >= b.at ? i : acc), -1);
  return (
    <div style={{ position: "absolute", left: 860, top: 300, width: 980, fontFamily: SANS, color: C.ink }}>
      <Rise start={0} dist={20}>
        <span
          style={{
            display: "inline-block",
            fontFamily: SANS,
            fontSize: 48,
            fontWeight: 900,
            color: C.yellow,
            background: C.violet,
            padding: "6px 22px",
            borderRadius: 3,
            letterSpacing: "0.12em",
          }}
        >
          {seg.chip}
        </span>
        {seg.badge ? (
          <span
            style={{
              display: "inline-block",
              marginLeft: 20,
              fontFamily: SANS,
              fontSize: 48,
              fontWeight: 900,
              color: C.ink,
              background: C.yellow,
              padding: "6px 22px",
              borderRadius: 3,
              letterSpacing: "0.08em",
            }}
          >
            {seg.badge}
          </span>
        ) : null}
      </Rise>
      {seg.beats.map((b, i) => {
        if (i !== idx) return null;
        const start = Math.round((b.at - seg.from) * 30);
        return (
          <div key={i} style={{ position: "absolute", top: 110, left: 0, width: 980 }}>
            <Rise start={Math.max(0, start)} dist={34}>
              <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.3, whiteSpace: "nowrap" }}>{b.head}</div>
            </Rise>
          </div>
        );
      })}
    </div>
  );
};

/** スマホ（左）＋字幕（右）の場面。enter=false なら前の場面から続けて、スマホを動かさずに出す */
const DemoScene: React.FC<{ segs: Seg[]; enter: boolean }> = ({ segs, enter: animate }) => {
  const f = useCurrentFrame();
  const enter = animate ? interpolate(f, [0, 22], [0, 1], { ...clamp, easing: EASE }) : 1;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {/* スマホは場面を通して固定し、中の素材だけを切り替える */}
      <div style={{ position: "absolute", left: 250, top: 70, translate: `${(1 - enter) * -120}px 0px`, opacity: enter }}>
        <Phone height={880}>
          <Series>
            {segs.map((s) => (
              <Series.Sequence key={s.clip} durationInFrames={s.frames}>
                <Footage clip={s.clip} from={s.from} zoom={s.zoom} />
              </Series.Sequence>
            ))}
          </Series>
        </Phone>
      </div>
      <Series>
        {segs.map((s) => (
          <Series.Sequence key={s.clip} durationInFrames={s.frames}>
            <Caption seg={s} />
          </Series.Sequence>
        ))}
      </Series>
      {/* 誤解防止：読める大きさの札で「デモ画面」と示す */}
      <div style={{ position: "absolute", left: 860, top: 850, fontFamily: SANS, fontSize: 48, fontWeight: 900, color: C.white, background: C.ink, padding: "8px 24px", borderRadius: 3, opacity: enter }}>
        デモ画面（架空のイベント）
      </div>
    </AbsoluteFill>
  );
};

export const Demo: React.FC = () => <DemoScene segs={SEGS} enter />;
export const Venue: React.FC = () => <DemoScene segs={VENUE_SEGS} enter={false} />;
