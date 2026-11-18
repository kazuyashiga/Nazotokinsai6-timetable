import { getPointAtLength } from "@remotion/paths";
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Marker, Rise, SlideChars } from "../components/Motion";
import { DenseTable } from "../scenes/Problem";
import { Sheet } from "../scenes/Organizer";
import { C, clamp, MONO, SANS } from "../theme";
import { CLICK, DM_END, T, HOOK_RAIL_Y, Leg, LEGS, LOOP, OUT, PDF, piecewise, POINT_CENTERS, POINTS, PUB, SHEET, START } from "./geo";

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ position: "absolute", left: x, top: y, ...extra });

/** 線の頭の位置（フレーム f） */
export const headAt = (leg: Leg, f: number) => getPointAtLength(leg.d, Math.max(0, Math.min(leg.total, piecewise(f, leg.keys)))) ?? { x: 0, y: 0 };
/** [from, to] のフレームのうち、線の頭が条件を満たす最初のフレーム（文字・カードを線に合わせて出すため） */
const passFrame = (leg: Leg, from: number, to: number, ok: (p: { x: number; y: number }) => boolean) => {
  for (let f = from; f <= to; f++) if (ok(headAt(leg, f))) return f;
  return to;
};
const LEG_A = LEGS[0];

/* ─────────── 背景：世界いっぱいの時間割の罫 ─────────── */
export const Grid: React.FC = () => (
  <div
    style={{
      ...abs(-1200, -1200),
      width: 9600,
      height: 6600,
      backgroundImage: [
        "linear-gradient(rgba(91,33,182,.07) 2px, transparent 2px)",
        "linear-gradient(90deg, rgba(91,33,182,.07) 2px, transparent 2px)",
        "linear-gradient(rgba(91,33,182,.03) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(91,33,182,.03) 1px, transparent 1px)",
      ].join(","),
      backgroundSize: "240px 240px, 240px 240px, 60px 60px, 60px 60px",
    }}
  />
);

/* ─────────── 開場：線が時間の軸になり、時間割が組み上がる ─────────── */
const TITLE = [
  { text: "使いやすい", y: 222 },
  { text: "タイムテーブル、", y: 372 },
  { text: "できました。", y: 522 },
];
const TITLE_X = 160;
const TITLE_FS = 132;
/** 線の頭が x を通り過ぎるフレーム（開場の横の区間） */
const passX = (x: number) => passFrame(LEG_A, T(0), T(110), (p) => p.x >= x);

export const StartDot: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - T(2), fps, config: { damping: 11, stiffness: 160 } });
  return (
    <div style={abs(START[0], START[1])}>
      {[0, 1].map((k) => {
        const t = ((f + k * 20) % 40) / 40;
        return (
          <div key={k} style={{ position: "absolute", left: -30, top: -30, width: 60, height: 60, borderRadius: "50%", border: `5px solid ${C.yellow}`, scale: String(1 + t * 1.6), opacity: (1 - t) * 0.9 * pop }} />
        );
      })}
      <div style={{ position: "absolute", left: -30, top: -30, width: 60, height: 60, borderRadius: "50%", background: C.yellow, border: `8px solid ${C.ink}`, boxSizing: "border-box", scale: String(pop) }} />
    </div>
  );
};

export const HookTitle: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  let last = 0;
  return (
    <>
      <Rise start={T(30)} style={abs(TITLE_X, 110)}>
        <div style={{ fontFamily: SANS, fontSize: 56, fontWeight: 900, color: C.violet, whiteSpace: "nowrap" }}>謎解きイベントの主催者さまへ</div>
      </Rise>
      {TITLE.map((line, li) =>
        [...line.text].map((ch, i) => {
          const x = TITLE_X + i * TITLE_FS;
          // 出発の点より左の文字も、線が走り出してから出す
          const at = Math.max(T(16) + li * 3, passX(x + TITLE_FS / 2) + li * 2);
          last = Math.max(last, at);
          const p = spring({ frame: f - at, fps, config: { damping: 13, stiffness: 150 } });
          return (
            <div
              key={`${li}-${i}`}
              style={{
                ...abs(x, interpolate(p, [0, 1], [HOOK_RAIL_Y - TITLE_FS / 2, line.y])),
                width: TITLE_FS,
                fontFamily: SANS,
                fontSize: TITLE_FS,
                lineHeight: 1,
                fontWeight: 900,
                color: C.ink,
                textAlign: "center",
                opacity: interpolate(p, [0, 0.25], [0, 1], clamp),
                scale: String(interpolate(p, [0, 1], [0.25, 1])),
                rotate: `${interpolate(p, [0, 1], [i % 2 ? 24 : -24, 0])}deg`,
              }}
            >
              {ch}
            </div>
          );
        }),
      )}
      <div style={{ ...abs(TITLE_X - 6, 522 + TITLE_FS * 0.62), height: TITLE_FS * 0.36, width: interpolate(f, [last + 6, last + 20], [0, 6 * TITLE_FS + 12], clamp), background: C.yellow, zIndex: -1 }} />
    </>
  );
};

/** 線の上に時刻の目盛り、線の下に公演枠のブロック（画像は使わず、図形だけで時間割が組み上がる） */
const TICKS = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30"].map((t, i) => ({ t, x: 480 + i * 240 }));
const BLOCKS: { x: number; w: number; lane: number; c: string; ink: string }[] = [
  { x: 300, w: 330, lane: 0, c: C.violet, ink: "rgba(255,255,255,.55)" },
  { x: 690, w: 420, lane: 0, c: C.yellow, ink: "rgba(22,19,31,.35)" },
  { x: 1170, w: 300, lane: 0, c: C.ink, ink: "rgba(255,255,255,.45)" },
  { x: 1530, w: 250, lane: 0, c: "#c4b5fd", ink: "rgba(46,16,101,.45)" },
  { x: 420, w: 360, lane: 1, c: "#c4b5fd", ink: "rgba(46,16,101,.45)" },
  { x: 840, w: 300, lane: 1, c: C.violet, ink: "rgba(255,255,255,.55)" },
  { x: 1200, w: 420, lane: 1, c: C.yellow, ink: "rgba(22,19,31,.35)" },
];
export const HookTimeline: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f > T(330)) return null;
  return (
    <>
      {TICKS.map(({ t, x }) => {
        const at = passX(x);
        const p = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 200 } });
        const grow = interpolate(f, [at, at + 16], [0, 1], { ...clamp, easing: OUT });
        return (
          <React.Fragment key={t}>
            {/* 縦の罫：線から下へ伸びる */}
            <div style={{ ...abs(x - 1, HOOK_RAIL_Y + 18), width: 3, height: 270 * grow, background: "rgba(91,33,182,.22)" }} />
            <div style={{ ...abs(x - 60, HOOK_RAIL_Y - 64), width: 120, textAlign: "center", fontFamily: MONO, fontSize: 30, fontWeight: 700, color: C.sub, opacity: p, translate: `0px ${(1 - p) * 20}px` }}>{t}</div>
          </React.Fragment>
        );
      })}
      {BLOCKS.map((b, i) => {
        const at = passX(b.x) + 2;
        const p = spring({ frame: f - at, fps, config: { damping: 12, stiffness: 170 } });
        return (
          <div
            key={i}
            style={{
              ...abs(b.x, HOOK_RAIL_Y + 60 + b.lane * 112),
              width: b.w,
              height: 92,
              borderRadius: 8,
              background: b.c,
              boxShadow: "0 10px 22px rgba(22,19,31,.14)",
              transformOrigin: "0 50%",
              scale: `${p} ${interpolate(p, [0, 1], [0.6, 1])}`,
              opacity: interpolate(p, [0, 0.2], [0, 1], clamp),
              padding: "18px 20px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ height: 14, width: "62%", borderRadius: 7, background: b.ink }} />
            <div style={{ height: 12, width: "38%", borderRadius: 6, background: b.ink, marginTop: 14, opacity: 0.7 }} />
          </div>
        );
      })}
    </>
  );
};

/* ─────────── 課題：PDF の表を、線が横に切り裂く ─────────── */
const CUT = passFrame(LEG_A, T(190), T(230), (p) => p.y > 1690 && p.x <= PDF.x + PDF.w / 2);
const ISSUES = ["拡大しないと、読めない。", "ハシゴの組み立ては、お客さん任せ。", "時間の重なりに、気づけない。"];

const PdfCard: React.FC<{ half: "top" | "bottom" }> = ({ half }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: "#fbfbf8",
      borderRadius: 6,
      overflow: "hidden",
      boxShadow: "0 24px 50px rgba(22,19,31,.22)",
      clipPath: half === "top" ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)",
    }}
  >
    <div style={{ position: "absolute", left: 0, top: 0, width: 520, height: 880, scale: String(PDF.w / 520), transformOrigin: "0 0" }}>
      <DenseTable />
    </div>
  </div>
);

export const PdfStation: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f - T(126), fps, config: { damping: 16 } });
  const cut = interpolate(f, [CUT, CUT + 30], [0, 1], { ...clamp, easing: OUT });
  if (f < T(110) || f > T(330)) return null;
  return (
    <div style={{ ...abs(PDF.x, PDF.y), width: PDF.w, height: PDF.h, perspective: 1600, opacity: inP }}>
      {(["top", "bottom"] as const).map((h) => {
        const k = h === "top" ? -1 : 1;
        return (
          <div
            key={h}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateY(${k * cut * 300}px) rotateX(${-k * cut * 58}deg) rotateZ(${-k * cut * 7}deg) rotateY(${(1 - cut) * 10}deg) scale(${0.9 + 0.1 * inP})`,
              opacity: 1 - interpolate(cut, [0.5, 1], [0, 1], clamp),
            }}
          >
            <PdfCard half={h} />
          </div>
        );
      })}
    </div>
  );
};

export const PdfTexts: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T(120)) return null;
  return (
    <>
      <Rise start={T(140)} style={abs(1080, 1440)}>
        <div style={{ fontFamily: SANS, fontSize: 54, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>よくある、画像・PDF の表。</div>
      </Rise>
      {ISSUES.map((t, i) => {
        const strike = interpolate(f, [CUT + 4 + i * 4, CUT + 18 + i * 4], [0, 100], { ...clamp, easing: OUT });
        return (
          <Rise key={t} start={T(150) + i * 9} style={abs(1080, 1780 + i * 76)}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: SANS, fontSize: 46, fontWeight: 900, color: C.ink, whiteSpace: "nowrap", opacity: 1 - strike / 250 }}>
              <span style={{ fontFamily: MONO, color: C.red, width: 36 }}>×</span>
              <span style={{ position: "relative" }}>
                {t}
                <span style={{ position: "absolute", left: 0, top: "54%", height: 7, width: `${strike}%`, background: C.violet }} />
              </span>
            </div>
          </Rise>
        );
      })}
      <div style={{ ...abs(150, 1562), fontFamily: SANS, fontSize: 110, fontWeight: 900, color: C.violet, whiteSpace: "nowrap" }}>
        <SlideChars text="ぜんぶ、スマホで。" start={CUT + 6} step={1.4} />
      </div>
    </>
  );
};

/* ─────────── いいところ 3 つ：線が通るたびに、カードが表へ返る ─────────── */
const CARDS = [
  { head: "見やすい。\n選びやすい。\n迷わない。", bg: C.violet, fg: C.white, chip: C.yellow, tag: "参加者" },
  { head: "＋1 公演が\n増える仕組み。", bg: C.yellow, fg: C.ink, chip: C.violet, tag: "参加者 → 主催" },
  { head: "主催は\nスプシに\n入れるだけ。", bg: C.ink, fg: C.white, chip: C.yellow, tag: "主催" },
];
const CARD_AT = POINT_CENTERS.map((cx) => passFrame(LEG_A, T(300), T(420), (p) => p.y < POINTS.railY + 5 && p.x >= cx - 40));

export const PointsTitle: React.FC = () => (
  <Rise start={T(288)} style={abs(200, 2700)}>
    <div style={{ fontFamily: SANS, fontSize: 84, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>この 3 つが、いいところ。</div>
  </Rise>
);

export const PointsCards: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(280)) return null;
  return (
    <div style={{ ...abs(POINTS.cardX, POINTS.cardY), display: "flex", gap: POINTS.gap, perspective: 1600 }}>
      {CARDS.map((c, i) => {
        const flip = spring({ frame: f - CARD_AT[i], fps, config: { damping: 15, stiffness: 120 } });
        return (
          <div
            key={i}
            style={{
              width: POINTS.cardW,
              height: POINTS.cardH,
              borderRadius: 6,
              background: c.bg,
              color: c.fg,
              padding: "44px 44px",
              boxSizing: "border-box",
              rotate: `x ${(1 - flip) * 90}deg`,
              transformOrigin: "50% 0",
              opacity: interpolate(flip, [0, 0.15], [0, 1], clamp),
              boxShadow: "0 18px 40px rgba(22,19,31,.18)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              fontFamily: SANS,
            }}
          >
            <div style={{ fontSize: 46, fontWeight: 900, color: c.chip, letterSpacing: "0.04em" }}>{c.tag}</div>
            <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.25, whiteSpace: "pre" }}>{c.head}</div>
            <div />
          </div>
        );
      })}
    </div>
  );
};

/* ─────────── ＋1：線が輪を描き、＋1 が灯る → 期待できる効果 ─────────── */
const ROWS = [
  { from: "スキマ提案・絞り込み", to: "回遊（＋1 公演）" },
  { from: "会場のルート案内", to: "迷わず次の公演へ" },
  { from: "SNS でシェア", to: "口コミ・認知" },
  { from: "URL で予定を共有", to: "友達同士の参加・交流" },
];
const PLUS_AT = T(1290);
export const PlusFill: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill = spring({ frame: f - PLUS_AT, fps, config: { damping: 11, stiffness: 150 } });
  if (f < PLUS_AT - 4) return null;
  return (
    <div
      style={{
        ...abs(LOOP.cx - 236, LOOP.cy - 236),
        width: 472,
        height: 472,
        borderRadius: "50%",
        background: C.yellow,
        scale: String(fill),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
        fontWeight: 900,
        fontSize: 260,
        color: C.violet,
        letterSpacing: "-0.04em",
      }}
    >
      <span style={{ rotate: `${(1 - fill) * -30}deg`, display: "inline-block", marginTop: -20 }}>+1</span>
    </div>
  );
};

export const PlusTexts: React.FC = () => {
  const f = useCurrentFrame();
  if (f < PLUS_AT - 4) return null;
  const x = LOOP.cx + LOOP.r + 80;
  return (
    <>
      <div style={{ ...abs(x, 100), fontFamily: SANS, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>
        <Rise start={PLUS_AT + 2}>
          <div style={{ fontSize: 72 }}>お客さんの＋1 は、</div>
        </Rise>
        <Rise start={PLUS_AT + 10}>
          <div style={{ fontSize: 96, marginTop: 4 }}>
            <Marker start={PLUS_AT + 22}>主催の＋1。</Marker>
          </div>
        </Rise>
      </div>
      {/* 誤解防止：数値の保証ではないので「期待できる効果」と示す */}
      <Rise start={PLUS_AT + 24} style={abs(x, 372, { whiteSpace: "nowrap" })}>
        <span style={{ fontFamily: SANS, fontSize: 40, fontWeight: 900, color: C.ink, background: C.yellow, padding: "4px 18px", borderRadius: 3 }}>期待できる効果</span>
      </Rise>
      {ROWS.map((r, i) => {
        const s = PLUS_AT + 30 + i * 9;
        const arrow = interpolate(f, [s + 6, s + 22], [0, 1], { ...clamp, easing: OUT });
        return (
          <Rise key={r.from} start={s} style={{ ...abs(x, 450 + i * 104), display: "flex", alignItems: "center", fontFamily: SANS, whiteSpace: "nowrap" }}>
            <div style={{ width: 440, boxSizing: "border-box", fontSize: 38, fontWeight: 700, color: C.ink, background: C.white, border: `3px solid ${C.ink}`, borderRadius: 4, padding: "14px 22px" }}>{r.from}</div>
            <div style={{ width: 100, height: 7, margin: "0 22px", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: 7, width: `${arrow * 100}%`, background: C.violet }} />
              <div
                style={{
                  position: "absolute",
                  left: `calc(${arrow * 100}% - 4px)`,
                  top: -12,
                  width: 0,
                  height: 0,
                  borderTop: "15px solid transparent",
                  borderBottom: "15px solid transparent",
                  borderLeft: `22px solid ${C.violet}`,
                  opacity: arrow,
                }}
              />
            </div>
            <div style={{ fontSize: 44, fontWeight: 900, color: C.violet, opacity: arrow }}>{r.to}</div>
          </Rise>
        );
      })}
    </>
  );
};

/* ─────────── スプシ：線がボタンを押す → 表がたたまれ、タイムテーブルが立ち上がる ─────────── */
export const SheetStation: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(1350) || f > CLICK + 60) return null;
  const inP = spring({ frame: f - T(1372), fps, config: { damping: 16 } });
  const typing = interpolate(f, [T(1396), T(1428)], [0, 4], clamp);
  const menu = f < CLICK + 2 ? interpolate(f, [T(1428), T(1435)], [0, 1], clamp) : interpolate(f, [CLICK + 2, CLICK + 8], [1, 0], clamp);
  const fold = interpolate(f, [CLICK + 8, CLICK + 30], [0, 1], { ...clamp, easing: OUT });
  return (
    <div style={{ ...abs(SHEET.x, SHEET.y), width: 1200, height: 420, perspective: 1800, opacity: inP * (1 - interpolate(fold, [0.6, 1], [0, 1], clamp)) }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - inP) * 80}px) rotateX(${fold * 80}deg)`, transformOrigin: "50% 100%" }}>
        <Sheet typing={typing} menu={menu} menuItem="公演一覧へ反映する" x={0} y={0} />
      </div>
    </div>
  );
};

export const SheetTexts: React.FC = () => {
  const f = useCurrentFrame();
  if (f < T(1350)) return null;
  return (
    <div style={{ ...abs(SHEET.x, 1400), fontFamily: SANS, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>
      <Rise start={T(1376)}>
        <div style={{ fontSize: 56, color: C.violet }}>主催は、</div>
      </Rise>
      <Rise start={T(1384)}>
        <div style={{ fontSize: 80, marginTop: 6 }}>
          スプシに入れて、<Marker start={T(1400)}>ボタンを押すだけ。</Marker>
        </div>
      </Rise>
    </div>
  );
};

/** 押した瞬間の波紋と、公開されたタイムテーブル */
export const Published: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < CLICK - 2) return null;
  const up = spring({ frame: f - (CLICK + 16), fps, config: { damping: 18, stiffness: 120 } });
  const ring = interpolate(f, [CLICK, CLICK + 22], [0, 1], clamp);
  const phoneW = Math.round((PUB.h - 30) * (390 / 664)) + 30;
  return (
    <>
      {ring < 1 && (
        <div style={{ ...abs(SHEET.menu[0] - 50, SHEET.menu[1] - 50), width: 100, height: 100, borderRadius: "50%", border: `8px solid ${C.yellow}`, scale: String(0.4 + ring * 1.6), opacity: 1 - ring }} />
      )}
      <div style={{ ...abs(PUB.cx - phoneW / 2, PUB.cy - PUB.h / 2), opacity: interpolate(up, [0, 0.2], [0, 1], clamp), translate: `0px ${(1 - up) * 220}px`, scale: String(0.7 + 0.3 * up) }}>
        <Phone height={PUB.h}>
          <Img src={staticFile("themes/violet.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Phone>
      </div>
    </>
  );
};

/* ─────────── ゴール：DM の窓口 ─────────── */
const OFFERS = ["設定・URL 発行まで、導入をサポートします。", "会場マップの設定も、サポートに含めて対応。", "デザインや条件も、イベントに合わせてご相談。"];
export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T(1490)) return null;
  const box = spring({ frame: f - T(1532), fps, config: { damping: 14, stiffness: 130 } });
  const pin = spring({ frame: f - T(1528), fps, config: { damping: 9, stiffness: 160 } });
  return (
    <>
      {OFFERS.map((o, i) => (
        <Rise key={o} start={T(1522) + i * 9} style={abs(5000, 2770 + i * 94)}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, fontFamily: SANS, fontSize: 56, fontWeight: 900, color: C.ink, whiteSpace: "nowrap" }}>
            <span style={{ width: 20, height: 20, background: C.violet, rotate: "45deg", display: "inline-block" }} />
            {o}
          </div>
        </Rise>
      ))}
      {/* 窓口：右端が線の終点 */}
      <div
        style={{
          ...abs(DM_END[0], DM_END[1]),
          translate: "-100% -50%",
          display: "flex",
          alignItems: "center",
          gap: 26,
          background: C.yellow,
          color: C.ink,
          borderRadius: 8,
          padding: "26px 40px",
          whiteSpace: "nowrap",
          fontFamily: SANS,
          fontSize: 60,
          fontWeight: 900,
          boxShadow: "0 18px 40px rgba(22,19,31,.2)",
          scale: String(0.85 + 0.15 * box),
          opacity: box,
          transformOrigin: "100% 50%",
        }}
      >
        <svg width="64" height="48" viewBox="0 0 64 48">
          <rect x="3" y="3" width="58" height="42" rx="4" fill="none" stroke={C.ink} strokeWidth="6" />
          <path d="M5 7 L32 28 L59 7" fill="none" stroke={C.ink} strokeWidth="6" strokeLinejoin="round" />
        </svg>
        導入のご相談は、このアカウントの DM まで。
      </div>
      {/* 到着のピン（アプリの到着ピンと同じ形） */}
      <svg
        width={96}
        height={125}
        viewBox="0 0 40 52"
        style={{ ...abs(DM_END[0] - 48, DM_END[1] - 122), translate: `0px ${(1 - pin) * -160}px`, opacity: interpolate(pin, [0, 0.15], [0, 1], clamp), overflow: "visible" }}
      >
        <path d="M20 51s17-17.6 17-30.5A17 17 0 0 0 3 20.5C3 33.4 20 51 20 51z" fill={C.violet} stroke="#fff" strokeWidth={3} />
        <circle cx={20} cy={20.5} r={6.5} fill="#fff" />
      </svg>
    </>
  );
};
