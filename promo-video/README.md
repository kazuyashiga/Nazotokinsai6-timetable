# 主催者向け PR 動画（Remotion）

「使いやすいタイムテーブル、できました。」— 謎解きイベントの主催者に向けた約 86 秒の紹介動画です。
1920×1080・30fps・無音（X の音声オフ自動再生を前提に、文字だけで伝わる構成）。

## 構成（`src/theme.ts` の `SCENES`）

| 秒 | 場面 | ファイル |
|---|---|---|
| 0–5 | 開場：ポスター 7 枚 → 実機、見出し | `scenes/Hook.tsx` |
| 5–12 | 課題：画像・PDF の表の不便 | `scenes/Problem.tsx` |
| 12–16 | 要点 3 つ | `scenes/Points.tsx` |
| 16–40 | 参加者の体験（実機の操作 4 つ） | `scenes/Demo.tsx`（`Demo`） |
| 40–50 | 会場マップ：ルート案内・拡大・階段で上の階へ（新機能） | `scenes/Demo.tsx`（`Venue`） |
| 50–55 | 主催にも：参加者の＋1 は主催の＋1 | `scenes/Bridge.tsx` |
| 55–73 | 主催の設定：スプシ→ボタン／フォーム取込／着せ替え／利用レポート | `scenes/Organizer.tsx` |
| 73–83 | ご相談：導入サポート（会場マップの設定を含む）・DM | `scenes/Cta.tsx` |
| 83–86 | エンドカード | `scenes/Cta.tsx` |

画面下の時刻の目盛り（`components/Motion.tsx` の `Ruler`）は、動画そのものを 1 本のタイムテーブルに見立てた演出です。

## モーション版（`Film`・約 67 秒）

1 枚の大きな時間割の上に場面を 3×3 に並べ、地図アプリのルートと同じ青い線（`#1a73e8`・流れる白い点）1 本で、
開場からゴール（DM）までをカットなしでつなぐ。カメラは線を追い、最後に引いて全体の道のりを見せる。

| 秒 | 場面 | 主な動き |
|---|---|---|
| 0–5 | 開場 | 出発の点から線が走って時間の軸になり、時刻と公演枠のブロックが組み上がる。見出しは線から立ち上がる |
| 5–11 | 課題 | PDF の表を線が横に切り裂き、表が上下に割れて「ぜんぶ、スマホで。」 |
| 11–17 | いいところ 3 つ | 線が通るたびに、カードが 1 枚ずつ表へ返る |
| 17–30 | 基本機能 | 選ぶ・絞る・共有の 3 台を 1 画面に。線の頭が着いたスマホを順に大きくする |
| 30–37 | 地図 | 線が画面に入って「ルートを見る」を押し、1 階 → 拡大 → 2 階まで（字幕は 1 つ） |
| 37–45 | スキマ提案 | 見どころ 2 を単独の駅で。線はこのスマホを通り抜けて＋1 へ |
| 45–52 | ＋1 | 線が輪を描き、＋1 が灯る → 期待できる効果 |
| 52–57 | スプシ | 線がメニュー「公演一覧へ反映する」を押す → 表がたたまれ、タイムテーブルが立ち上がる |
| 57–64 | ゴール | 線の終点に到着のピン、DM の窓口 |
| 64–67 | 全体 | 引いて道のり全体 → 見出し |

- 表示時間の調整：コードの時刻は「設計の時刻」。`geo.ts` の `EDITS` で、場面ごとに間を足す・移動を詰める（`T()` で実際の時刻に直る）
- 読む時間の点検：`npx tsx capture/timing-audit.ts`（各文字のかたまりが見えている秒数と、読むのに要る秒数の目安を並べる）

- 構成：`src/film/geo.ts`（駅の位置・線の形と進み方・カメラ）、`Line.tsx`（線）、`Stations.tsx`・`PhoneStation.tsx`（場面）、`Film.tsx`（全体）
- 素材：`capture/motion_assets.cjs` で、地図の後に残す最後のコマ（`public/motion/route_last.jpg`）を用意する。基本機能の止め絵（`select_start.jpg` など）も収録のコマから取る
- 書き出し：`npx remotion render Film out/film.mp4 --codec=h264 --crf=18`

## 表現のルール
- 実機の画面は、すべて実際のアプリ（`?mock=1` のサンプル公演）を実際に操作して収録したもの。架空の機能は描かない。
- 見どころ（要点の 3 枚）に書いていないことは描かない（モーション版では、フォーム取込・着せ替え・利用レポートの場面を外した）。
- スプレッドシートの列名・メニュー名・利用レポートの項目名は `scripts/gas/Code.js` の実物どおり。レポートの数値だけはイメージ（画面に明記）。
- 「無料」「有料」は書かない。窓口は投稿したアカウントの DM。

## 作り直し方

```bash
# 1) アプリを起動（リポジトリ直下）
npx vite --port 5179 --strictPort

# 2) 実機素材の収録（時間を止めて 1 コマずつ 3 倍解像度で撮る。1 本 30〜60 秒）
node promo-video/capture/record.cjs            # 全部
node promo-video/capture/record.cjs select gap # 一部だけ
node promo-video/capture/themes.cjs            # 着せ替え用の静止画

# 3) 文言を変えたら、フォントのサブセットを取り直す
cd promo-video && python3 capture/fetch_fonts.py

# 4) プレビュー・書き出し
npx remotion studio
npx remotion render PromoVideo out/promo.mp4 --codec=h264 --crf=18
```

### 収録の仕組み（`capture/record.cjs`）
ヘッドレス Chromium の画面配信（screencast）は端末のピクセル密度を反映せず 390px 幅になるため使わない。
`page.clock` で JS の時間を止め、CSS アニメーションは `Animation.setPlaybackRate(0)` ＋ `getAnimations()` の
`currentTime` 送りで 1 コマ（1/30 秒）ずつ進め、毎コマ 3 倍解像度のスクリーンショットを撮って ffmpeg でつなぐ。

### 書き出し環境
`remotion.config.ts` で Playwright 同梱のヘッドレス Chromium を使う設定にしている。
日本語フォントは全分割を読むと時間切れになるため、`public/fonts/` の文字サブセットを使う。

## ライセンス
Remotion は個人・3 人以下のチームなら無料ライセンスで利用できる（https://www.remotion.dev/docs/license/faq ）。
