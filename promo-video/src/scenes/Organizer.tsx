import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Marker, Rise } from "../components/Motion";
import { C, clamp, EASE, MONO, SANS } from "../theme";

/* 実物（scripts/gas/Code.js）の名前をそのまま使う */
const SHEET_TAB = "1.公演かんたん入力";
const HEADERS: [string, string][] = [
  ["日程", "#2563eb"],
  ["団体名", "#2563eb"],
  ["公演名", "#2563eb"],
  ["開始時間リスト", "#2563eb"],
  ["所要時間(分)", "#16a34a"],
  ["参加料金", "#16a34a"],
  ["内容目安", "#d97706"],
];
const ROWS = [
  ["1日目", "難問工房サンプル", "サンプル監獄からの最終脱獄", "11:30, 14:00, 16:00", "60", "3000", "高難易度・経験者向け"],
  ["1日目", "サンプル謎解き部", "はじめてのサンプル謎解き教室", "10:30, 12:00, 13:45", "45", "1500", "初心者向け・ヒントあり"],
  ["1日目", "喫茶サンプル", "サンプル喫茶と秘密のレシピ", "10:00-12:00, 13:00-18:00", "30", "1000", "カフェ謎・ドリンク付き"],
  ["2日目", "まちあるき謎サンプル", "サンプル商店街ぐるり周遊謎", "11:00, 14:00", "90", "1800", "周遊型・ファミリー向け"],
];
const WIDTHS = [74, 190, 254, 236, 132, 92, 214];

/** 場面の見出し（1 場面 1 メッセージ。補足は置かず、中身は図で見せる） */
const Title: React.FC<{ head: React.ReactNode }> = ({ head }) => (
  <div style={{ position: "absolute", left: 150, top: 100, fontFamily: SANS, color: C.ink }}>
    <Rise start={0}>
      <div style={{ fontSize: 84, fontWeight: 900, whiteSpace: "nowrap" }}>{head}</div>
    </Rise>
  </div>
);

/** スプレッドシートの窓（汎用の表計算風。特定製品のロゴ・意匠は描かない） */
export const Sheet: React.FC<{ typing: number; menu: number; menuItem: string; x: number; y: number; scale?: number }> = ({ typing, menu, menuItem, x, y, scale = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 1200, scale: String(scale), transformOrigin: "0 0", background: C.white, borderRadius: 8, boxShadow: "0 20px 50px rgba(22,19,31,.18)", overflow: "hidden", fontFamily: SANS }}>
    <div style={{ height: 52, background: "#eef0f4", display: "flex", alignItems: "center", gap: 26, padding: "0 20px", fontSize: 20, color: "#333" }}>
      <span>ファイル</span>
      <span>編集</span>
      <span>表示</span>
      <span style={{ position: "relative", padding: "6px 10px", borderRadius: 4, background: menu > 0 ? "#dbe4ff" : "transparent", fontWeight: 700 }}>
        タイムテーブル連携
        {menu > 0 && (
          <div style={{ position: "absolute", top: 44, left: 0, width: 470, background: C.white, boxShadow: "0 10px 30px rgba(0,0,0,.2)", borderRadius: 6, padding: "8px 0", opacity: menu, zIndex: 3 }}>
            {["【初回】入力シートをセットアップする", "公演一覧へ反映する", "フォーム回答を入力シートへ取込", "利用レポートを更新・表示"].map((m) => (
              <div key={m} style={{ padding: "10px 18px", fontSize: 21, fontWeight: m === menuItem ? 900 : 500, background: m === menuItem ? "#ede9fe" : "transparent", color: m === menuItem ? C.violet : "#333" }}>
                {m}
              </div>
            ))}
          </div>
        )}
      </span>
    </div>
    <div style={{ display: "flex", background: "#f8f9fb", borderBottom: "1px solid #ddd" }}>
      {HEADERS.map(([h, c], i) => (
        <div key={h} style={{ width: WIDTHS[i], padding: "10px 8px", fontSize: 17, fontWeight: 900, color: C.white, background: c, borderRight: "1px solid rgba(255,255,255,.4)" }}>{h}</div>
      ))}
    </div>
    {ROWS.map((r, ri) => (
      <div key={ri} style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
        {r.map((cell, ci) => {
          const k = Math.max(0, Math.min(1, typing - ri));
          const shown = cell.slice(0, Math.round(cell.length * k));
          return (
            <div key={ci} style={{ width: WIDTHS[ci], padding: "12px 8px", fontSize: 18, color: "#222", whiteSpace: "nowrap", overflow: "hidden", borderRight: "1px solid #eee", fontFamily: ci === 3 || ci === 4 || ci === 5 ? MONO : SANS }}>
              {shown}
            </div>
          );
        })}
      </div>
    ))}
    <div style={{ display: "flex", gap: 0, background: "#eef0f4", padding: "0 12px" }}>
      {[SHEET_TAB, "2.公演一覧", "設定", "利用レポート"].map((t, i) => (
        <div key={t} style={{ padding: "10px 18px", fontSize: 18, fontWeight: i === 0 ? 900 : 500, background: i === 0 ? C.white : "transparent", color: i === 0 ? "#1a73e8" : "#555" }}>{t}</div>
      ))}
    </div>
  </div>
);

/** a) スプシに入れて、ボタンひとつで公開 */
const Publish: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typing = interpolate(f, [16, 90], [0, ROWS.length], clamp);
  const menu = interpolate(f, [96, 104], [0, 1], clamp);
  const click = f >= 116;
  const out = spring({ frame: f - 122, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill>
      <Title head={<>スプシに入れて、<Marker start={14}>ボタンを押すだけ。</Marker></>} />
      <Sheet typing={typing} menu={click ? 1 - interpolate(f, [118, 126], [0, 1], clamp) : menu} menuItem="公演一覧へ反映する" x={150} y={320} scale={1 - out * 0.12} />
      {/* クリックの波紋 */}
      {f >= 110 && f < 132 && (
        <div style={{ position: "absolute", left: 150 + 460, top: 320 + 52 + 44 + 60, width: 70, height: 70, marginLeft: -35, marginTop: -35, borderRadius: "50%", border: `5px solid ${C.yellow}`, scale: String(interpolate(f, [110, 132], [0.4, 1.6])), opacity: interpolate(f, [110, 132], [1, 0]) }} />
      )}
      {/* 公開されたサイト */}
      <div style={{ position: "absolute", left: 1330, top: 250, opacity: out, translate: `${(1 - out) * 160}px 0px` }}>
        <Phone height={720}>
          <Img src={staticFile("themes/violet.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Phone>
      </div>
      <div style={{ position: "absolute", left: 1200, top: 560, width: 120, height: 10, background: C.violet, opacity: out, scale: `${out} 1`, transformOrigin: "0 50%" }} />
    </AbsoluteFill>
  );
};

/** b) 出展団体の登録はフォーム → 回答もボタンひとつで取り込み */
const FormImport: React.FC = () => {
  const f = useCurrentFrame();
  const fields = ["団体名", "公演名", "開始時間リスト", "所要時間(分)"];
  const arrow = interpolate(f, [34, 56], [0, 1], { ...clamp, easing: EASE });
  return (
    <AbsoluteFill>
      <Title head={<>出展団体の登録は、<Marker start={14}>フォームで。</Marker></>} />
      <Rise start={6} style={{ position: "absolute", left: 150, top: 330 }}>
        <div style={{ width: 560, background: C.white, borderRadius: 8, borderTop: `14px solid ${C.violet}`, boxShadow: "0 20px 50px rgba(22,19,31,.15)", padding: "30px 36px", fontFamily: SANS }}>
          <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 20 }}>出展団体 登録フォーム</div>
          {fields.map((x, i) => (
            <div key={x} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 20, color: C.sub, marginBottom: 6 }}>{x}</div>
              <div style={{ height: 40, borderBottom: `2px solid ${C.line}`, fontSize: 22, fontFamily: i >= 2 ? MONO : SANS, color: C.ink, overflow: "hidden" }}>
                {["喫茶サンプル", "サンプル喫茶と秘密のレシピ", "10:00-12:00, 13:00-18:00", "30"][i].slice(0, Math.round(interpolate(f, [8 + i * 6, 26 + i * 6], [0, 30], clamp)))}
              </div>
            </div>
          ))}
        </div>
      </Rise>
      <div style={{ position: "absolute", left: 760, top: 560, width: 200, height: 10, background: C.violet, scale: `${arrow} 1`, transformOrigin: "0 50%" }} />
      <div style={{ position: "absolute", left: 990, top: 420, opacity: arrow }}>
        <div style={{ fontFamily: SANS, fontSize: 36, fontWeight: 900, color: C.violet, marginBottom: 16 }}>回答は、ボタンひとつで取り込み</div>
        <div style={{ background: C.white, borderRadius: 8, boxShadow: "0 16px 40px rgba(22,19,31,.15)", padding: "22px 30px", fontFamily: SANS, fontSize: 48, fontWeight: 900, color: C.ink, border: `4px solid ${C.violet}` }}>
          フォーム回答を入力シートへ取込
        </div>
      </div>
    </AbsoluteFill>
  );
};

const THEMES = [
  { id: "violet", main: "#5b21b6", accent: "#facc15" },
  { id: "crimson", main: "#9f1239", accent: "#fde047" },
  { id: "forest", main: "#1f5135", accent: "#f59e0b" },
  { id: "navy", main: "#1e3a8a", accent: "#f472b6" },
];

/** c) 色を入れるだけで着せ替え（設定シートのメインカラー／アクセントカラー） */
const Theme: React.FC = () => {
  const f = useCurrentFrame();
  const per = 28;
  const idx = Math.min(THEMES.length - 1, Math.floor(Math.max(0, f - 14) / per));
  return (
    <AbsoluteFill>
      <Title head={<>色を変えれば、<Marker start={14}>イベントの顔</Marker>に。</>} />
      <div style={{ position: "absolute", left: 150, top: 380, display: "flex", flexDirection: "column", gap: 22 }}>
        {THEMES.map((t, i) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 18, opacity: i === idx ? 1 : 0.35, fontFamily: MONO, fontSize: 30, color: C.ink }}>
            <span style={{ width: 64, height: 64, borderRadius: 4, background: t.main }} />
            <span style={{ width: 64, height: 64, borderRadius: 4, background: t.accent }} />
            <span>{t.main}</span>
            <span style={{ color: C.sub }}>/</span>
            <span>{t.accent}</span>
          </div>
        ))}
        <Rise start={40}>
          <div style={{ marginTop: 26, fontFamily: SANS, fontSize: 48, fontWeight: 900, color: C.ink, border: `4px solid ${C.ink}`, borderRadius: 4, padding: "8px 22px", display: "inline-block" }}>
            MIT ライセンス：改変も自由
          </div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 1220, top: 290 }}>
        <Phone height={700}>
          {THEMES.map((t, i) => {
            const wipe = interpolate(f, [14 + (i - 1) * per, 14 + (i - 1) * per + 12], [0, 100], { ...clamp, easing: EASE });
            return (
              <Img
                key={t.id}
                src={staticFile(`themes/${t.id}.png`)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", clipPath: i === 0 ? "none" : `inset(0 ${100 - wipe}% 0 0)` }}
              />
            );
          })}
        </Phone>
      </div>
    </AbsoluteFill>
  );
};

/** d) 利用レポート：項目名は実物どおり。数値はイメージ */
const REPORT: [string, number][] = [
  ["総アクセス人数（UU）", 1840],
  ["ハシゴ計画作成人数", 612],
  ["「スキマ時間探索」実行回数", 388],
  ["スキマ候補からの公演追加回数", 147],
  ["「SNSでシェア」実行回数", 203],
];
const Report: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Title head={<>どれだけ使われたか、<Marker start={14}>自動で集計。</Marker></>} />
      <div style={{ position: "absolute", left: 150, top: 330, width: 1100, background: C.white, borderRadius: 8, boxShadow: "0 20px 50px rgba(22,19,31,.15)", overflow: "hidden", fontFamily: SANS }}>
        <div style={{ background: "#1f2937", color: C.white, fontSize: 30, fontWeight: 900, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>利用レポート</span>
          {/* 誤解防止：読める大きさの札で「数値はイメージ」と示す */}
          <span style={{ fontSize: 48, background: C.yellow, color: C.ink, padding: "2px 18px", borderRadius: 3 }}>数値はイメージ</span>
        </div>
        {REPORT.map(([k, v], i) => {
          const p = interpolate(f, [10 + i * 6, 50 + i * 6], [0, 1], { ...clamp, easing: EASE });
          return (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e5e7eb", fontSize: 32, opacity: interpolate(f, [6 + i * 6, 16 + i * 6], [0, 1], clamp) }}>
              <span style={{ fontWeight: 700 }}>{k}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: C.violet }}>{Math.round(v * p).toLocaleString("ja-JP")}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** 主催の設定（55–73 秒） */
export const Organizer: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <Sequence durationInFrames={180} layout="absolute-fill">
      <Publish />
    </Sequence>
    <Sequence from={180} durationInFrames={105} layout="absolute-fill">
      <FormImport />
    </Sequence>
    <Sequence from={285} durationInFrames={120} layout="absolute-fill">
      <Theme />
    </Sequence>
    <Sequence from={405} durationInFrames={135} layout="absolute-fill">
      <Report />
    </Sequence>
  </AbsoluteFill>
);
