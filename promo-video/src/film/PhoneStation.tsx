import React from "react";
import { Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ClipName, Footage, Phone } from "../components/Phone";
import { Marker, Rise } from "../components/Motion";
import { C, clamp, SANS } from "../theme";
import { BASIC, BASIC_WIN, GAP_CLIP, GAP_PHONE, OUT, PHONE, phoneBox, ROUTE_END, ROUTE_START, T } from "./geo";
import { ROUTE } from "./Line";
import gapClip from "../../public/footage/gap.json";

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ position: "absolute", left: x, top: y, ...extra });
const Still: React.FC<{ src: string }> = ({ src }) => <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;

/* ─────────── 基本機能：選ぶ・絞る・共有を 1 画面に。線の頭が着いたスマホを順に大きくする ─────────── */
type Basic = { chip: string; line: string; clip: ClipName; from: number; start: number; dur: number; before: string; after?: string };
const BASICS: Basic[] = [
  // 選ぶ：重なりの警告（素材の 4.17 秒）が 1 つ目の区間に入るように
  { chip: "選ぶ", line: "重なりは、その場で警告。", clip: "select", from: 2.0, start: BASIC_WIN[0][0], dur: 131, before: "motion/select_start.jpg", after: "motion/select_end.jpg" },
  { chip: "絞る", line: "難易度・タグで絞り込み。", clip: "filter", from: 0.6, start: BASIC_WIN[1][0] - 4, dur: 146, before: "motion/filter_start.jpg", after: "motion/filter_end.jpg" },
  { chip: "共有", line: "予定を、チケット画像で共有。", clip: "ticket", from: 1.7, start: BASIC_WIN[2][0] - 4, dur: 250, before: "motion/ticket_start.jpg" },
];
const BOX = phoneBox(BASIC.h);

/** i 番目のスマホの強調の度合い（0〜1） */
const focusOf = (f: number, i: number) => {
  const [a, b] = BASIC_WIN[i];
  return interpolate(f, [a, a + 10, b, b + 10], [0, 1, 1, 0], { ...clamp, easing: OUT });
};

export const BasicPhones: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(420) || f > T(820)) return null;
  const any = Math.max(...BASICS.map((_, i) => focusOf(f, i)));
  return (
    <>
      {BASICS.map((b, i) => {
        const appear = spring({ frame: f - (T(436) + i * 5), fps, config: { damping: 14, stiffness: 130 } });
        const fo = focusOf(f, i);
        const scale = (0.75 + 0.25 * appear) * (1 + 0.12 * fo - 0.06 * (any - fo));
        return (
          <div
            key={b.chip}
            style={{
              ...abs(BASIC.xs[i] - BOX.w / 2, BASIC.cy - BOX.h / 2),
              scale: String(scale),
              opacity: interpolate(appear, [0, 0.2], [0, 1], clamp) * (1 - 0.45 * (any - fo)),
              zIndex: fo > 0.5 ? 2 : 1,
            }}
          >
            <Phone height={BASIC.h}>
              {f < b.start && <Still src={b.before} />}
              <Sequence from={b.start} durationInFrames={b.dur}>
                <Footage clip={b.clip} from={b.from} />
              </Sequence>
              {b.after && f >= b.start + b.dur && <Still src={b.after} />}
            </Phone>
          </div>
        );
      })}
    </>
  );
};

export const BasicTexts: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(420) || f > T(820)) return null;
  const active = BASIC_WIN.findIndex(([a, b]) => f >= a && f < b + 6);
  return (
    <>
      <Rise start={T(440)} style={abs(2520, 2662)}>
        <div style={{ fontFamily: SANS, fontSize: 76, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>
          見やすい。<Marker start={T(456)}>選びやすい。</Marker>
        </div>
      </Rise>
      {/* 今強調しているスマホの説明（1 行） */}
      {BASICS.map((b, i) =>
        i === active ? (
          <Rise key={b.chip} start={BASIC_WIN[i][0]} dist={24} style={abs(2524, 2760)}>
            <div style={{ fontFamily: SANS, fontSize: 50, fontWeight: 900, color: C.violet, whiteSpace: "nowrap" }}>{b.line}</div>
          </Rise>
        ) : null,
      )}
      {/* 線上の節と札 */}
      {BASICS.map((b, i) => {
        const at = BASIC_WIN[i][0];
        if (f < at) return null;
        const pop = spring({ frame: f - at, fps, config: { damping: 10, stiffness: 200 } });
        const on = i === active;
        return (
          <React.Fragment key={b.chip}>
            <div
              style={{
                ...abs(BASIC.xs[i] - 22, BASIC.railY - 22),
                width: 44,
                height: 44,
                borderRadius: "50%",
                boxSizing: "border-box",
                background: on ? C.yellow : "#fff",
                border: `7px solid ${on ? C.ink : ROUTE.edge}`,
                scale: String(pop),
              }}
            />
            <div style={{ ...abs(BASIC.xs[i], BASIC.railY + 34), translate: "-50% 0", scale: String(pop), whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: SANS,
                  fontSize: 44,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  padding: "2px 20px",
                  borderRadius: 3,
                  color: on ? C.ink : C.yellow,
                  background: on ? C.yellow : C.violet,
                }}
              >
                {b.chip}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

/* ─────────── 地図：線が画面に入り「ルートを見る」を押す → 1 階 → 拡大 → 2 階 ─────────── */
export const MapPhone: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(726)) return null;
  const appear = spring({ frame: f - T(732), fps, config: { damping: 15, stiffness: 120 } });
  return (
    <div style={{ ...abs(PHONE.left, PHONE.top), perspective: 2400 }}>
      <div style={{ transform: `scale(${0.75 + 0.25 * appear}) rotateY(${(1 - appear) * 36}deg)`, opacity: interpolate(appear, [0, 0.2], [0, 1], clamp) }}>
        <Phone height={PHONE.h}>
          <Sequence from={ROUTE_START - 12} durationInFrames={ROUTE_END - ROUTE_START + 12}>
            <Footage clip="route" from={1.4} />
          </Sequence>
          {f >= ROUTE_END && <Still src="motion/route_last.jpg" />}
        </Phone>
      </div>
    </div>
  );
};

/** 字幕は 1 つだけ。その間に、画面の中で 1 階 → 拡大 → 2 階まで動く */
export const MapCaption: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T(740) || f > ROUTE_END + 16) return null;
  const out = interpolate(f, [ROUTE_END - 6, ROUTE_END + 10], [1, 0], clamp);
  return (
    <div style={{ ...abs(PHONE.cx + 480, 1520), fontFamily: SANS, fontWeight: 900, color: C.ink, whiteSpace: "nowrap", opacity: out }}>
      <Rise start={T(758)}>
        <div style={{ fontSize: 64 }}>次の部屋／場所まで、</div>
      </Rise>
      <Rise start={T(764)}>
        <div style={{ fontSize: 64, marginTop: 6 }}>
          <Marker start={T(780)}>地図でルート案内。</Marker>
        </div>
      </Rise>
    </div>
  );
};

/* ─────────── スキマ提案（見どころ 2）：単独の駅 ─────────── */
const GAP_BOX = phoneBox(GAP_PHONE.h);
/** 素材 gap の残りの長さ（フレーム）。終わったら最後のコマを残す */
const GAP_LEN = Math.floor((gapClip.seconds - (GAP_CLIP.from - 0.2)) * 30) - 1;
/** 素材の秒 → フレーム */
const gapAt = (sec: number) => Math.round(GAP_CLIP.start + (sec - GAP_CLIP.from) * 30);

export const GapStation: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(1034)) return null;
  const appear = spring({ frame: f - T(1040), fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ ...abs(GAP_PHONE.cx - GAP_BOX.w / 2, GAP_PHONE.cy - GAP_BOX.h / 2), perspective: 2400 }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * appear}) rotateY(${(1 - appear) * -40}deg)`, opacity: interpolate(appear, [0, 0.2], [0, 1], clamp) }}>
        <Phone height={GAP_PHONE.h}>
          <Sequence from={GAP_CLIP.start - 6} durationInFrames={GAP_LEN}>
            {/* 提案の一覧が出たら少し寄る（素材の秒で指定） */}
            <Footage clip="gap" from={GAP_CLIP.from - 0.2} zoom={[{ at: 3.3, to: 6.0, scale: 1.18, x: 195, y: 230 }]} />
          </Sequence>
          {f >= GAP_CLIP.start - 6 + GAP_LEN && <Still src="motion/gap_end.jpg" />}
        </Phone>
      </div>
    </div>
  );
};

export const GapTexts: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T(1040)) return null;
  return (
    <div style={{ ...abs(3390, GAP_PHONE.cy - 330), fontFamily: SANS, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>
      <Rise start={T(1056)}>
        <span style={{ display: "inline-block", fontSize: 42, color: C.yellow, background: C.violet, padding: "4px 20px", borderRadius: 3, letterSpacing: "0.08em" }}>＋1 公演が増える仕組み</span>
      </Rise>
      <Rise start={T(1064)}>
        <div style={{ fontSize: 112, lineHeight: 1.18, marginTop: 26 }}>スキマ時間に、</div>
      </Rise>
      <Rise start={T(1070)}>
        <div style={{ fontSize: 112, lineHeight: 1.18 }}>
          <Marker start={gapAt(3.3)}>自動で提案。</Marker>
        </div>
      </Rise>
      <Rise start={gapAt(5.4)}>
        <div style={{ fontSize: 50, marginTop: 36 }}>
          お客さんの<Marker start={gapAt(6.23)}>“もうひとつ”</Marker>が増える。
        </div>
      </Rise>
    </div>
  );
};

