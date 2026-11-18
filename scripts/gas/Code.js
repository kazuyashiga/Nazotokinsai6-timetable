/**
 * ==========================================================================
 * 謎解きフェス・イベント特化型 ハシゴタイムテーブル
 * スプレッドシート自動化スクリプト (Universal Timetable Core v2.0)
 * ==========================================================================
 * 
 * 主な機能:
 * 1. 1公演1行の「公演かんたん入力」から「公演一覧」へ全自動展開
 * 2. ボタンクリック（図形描画ボタン）での手動一括反映
 * 3. 展開後の「公演一覧」での個別編集・完売設定のカスタマイズ対応
 * 4. Web API (doGet) によるJSON配信
 */

// シート名の定義
const SHEET_DRAFT = "1.公演かんたん入力";
const SHEET_MAIN = "2.公演一覧";
const SHEET_CONFIG = "設定";
const SHEET_REPORT = "利用レポート";
const SHEET_RAW_LOG = "_集計ログ";

/**
 * 公演データが格納された本番シートを取得（過去のシート名「公演データ」にも完全互換対応）
 */
function getMainSheet(ss) {
  return ss.getSheetByName(SHEET_MAIN) || 
         ss.getSheetByName("② 公演一覧") || 
         ss.getSheetByName("公演一覧") || 
         ss.getSheetByName("公演データ");
}

/**
 * スプレッドシートを開いたときにメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("タイムテーブル連携")
    .addItem("【初回】入力シートをセットアップする", "setupDraftSheet")
    .addSeparator()
    .addItem("公演一覧へ反映する（ボタン割り当て用）", "expandDraftToTimetable")
    .addItem("Web公開用JSONをGitHubへ同期", "manualExportJsonToGitHub")
    .addSeparator()
    .addItem("出展団体向け登録Googleフォームを作成", "createEntryForm")
    .addItem("フォーム回答を入力シートへ取込", "importFormResponsesToDraft")
    .addSeparator()
    .addItem("利用レポートを更新・表示", "refreshAnalyticsReport")
    .addItem("利用レポートの集計をリセット", "resetAnalyticsData")
    .addSeparator()
    .addItem("GitHubアクセストークンを設定", "setupGitHubToken")
    .addItem("GitHubアクセストークンを削除", "clearGitHubToken")
    .addToUi();
}

/**
 * 入力シートを初期セットアップ（ヘッダー・ボタン配置エリア・色分け・入力例の自動作成）
 */
function setupDraftSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 旧シート名があればリネーム、無ければ新規作成
  let draftSheet = ss.getSheetByName(SHEET_DRAFT) || 
                   ss.getSheetByName("① 公演かんたん入力") || 
                   ss.getSheetByName("入力補助シート");
  if (!draftSheet) {
    draftSheet = ss.insertSheet(SHEET_DRAFT, 0);
  } else {
    draftSheet.setName(SHEET_DRAFT);
  }

  // 1行目: 操作コントロール・ボタン配置用バナー
  draftSheet.getRange("A1:C1").merge()
    .setValue("公演かんたん入力")
    .setBackground("#1e3a8a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  draftSheet.getRange("D1:F1").merge()
    .setValue("【ボタン配置エリア】")
    .setBackground("#dbeafe")
    .setFontColor("#1e40af")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  draftSheet.getRange("G1:S1").merge()
    .setValue("入力完了後、左のボタンを押すと「2.公演一覧」へ一括反映されます（スクロール時も常時固定表示）")
    .setBackground("#f8fafc")
    .setFontColor("#64748b")
    .setFontSize(9)
    .setVerticalAlignment("middle");

  draftSheet.setRowHeight(1, 45);

  // 2行目: ヘッダー定義
  const headers = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間リスト (例: 10:30, 12:00 / 随時: 10:00-12:00, 13:00-18:00)",
    "所要時間(分)", "参加料金", "定員", "予約形式", "難易度",
    "内容目安 (・区切りでタグ)", "予約URL", "公演ビジュアルURL",
    "所要時間優先テキスト", "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ];

  draftSheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  draftSheet.setRowHeight(2, 32);
  
  // スタイル設定（色分け）
  draftSheet.getRange("A2:E2").setBackground("#2563eb").setFontColor("#ffffff").setFontWeight("bold"); // 必須(青)
  draftSheet.getRange("F2:H2").setBackground("#16a34a").setFontColor("#ffffff").setFontWeight("bold"); // 基本(緑)
  draftSheet.getRange("I2:M2").setBackground("#d97706").setFontColor("#ffffff").setFontWeight("bold"); // 詳細(橙)
  draftSheet.getRange("N2:S2").setBackground("#7c3aed").setFontColor("#ffffff").setFontWeight("bold"); // 演出(紫)
  
  // 1〜2行目を固定（スクロールしてもボタンと列名が常に常駐）
  draftSheet.setFrozenRows(2);

  // 見本サンプルデータ（未入力の場合のみ挿入）
  if (draftSheet.getLastRow() <= 2) {
    const sampleRows = [
      [
        "1日目", "謎解き研究所", "からくり時計塔からの脱出", "メインホール(1F)",
        "10:30, 12:00, 13:20, 14:40, 16:00, 17:20",
        60, 2500, "4名×1チーム", "事前予約", 5,
        "・ストーリー重視・初心者歓迎", "https://example.com/reserve1", "", "", "", "", "", "", ""
      ],
      [
        "1日目", "ミステリーギルド", "電脳都市の暗号プロトコル", "ルームA(2F)",
        "10:30, 11:10, 11:50, 12:30, 13:10, 13:50, 15:00, 15:40, 16:20, 17:00, 17:40",
        30, 2000, "2名", "事前予約", "-",
        "・スコアアタック・謎解き経験者向け", "https://example.com/reserve2", "", "", "", "", "", "", ""
      ],
      [
        "2日目", "あおぞら探偵団", "星空キャンプと消えたコンパス", "メインホール(1F)",
        "11:30, 13:30, 15:30, 17:30, 19:30",
        90, 2500, "4人", "事前予約", 3,
        "・初心者歓迎・ファミリー向け", "https://example.com/reserve3", "", "", "", "", "", "", ""
      ],
      [
        "1日目", "なぞ解きカフェ", "秘密の角砂糖と迷宮ラテ", "カフェスペース(1F)",
        "10:00-12:00, 13:00-18:00",
        30, 1000, "1〜2名", "当日受付(ファミレス式)", 2,
        "・初心者歓迎・カフェ謎", "", "", "", "", "", "", "", ""
      ]
    ];
    draftSheet.getRange(3, 1, sampleRows.length, sampleRows[0].length).setValues(sampleRows);
  }

  // プルダウン設定（手動設定不要で自動付与）
  // 1. 日程 (A列)
  const ruleDay = SpreadsheetApp.newDataValidation()
    .requireValueInList(["1日目", "2日目", "3日目"], true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("A3:A200").setDataValidation(ruleDay);

  // 2. 予約形式 (I列)
  const ruleType = SpreadsheetApp.newDataValidation()
    .requireValueInList(["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"], true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("I3:I200").setDataValidation(ruleType);

  // 3. 難易度 (J列)
  const ruleDiff = SpreadsheetApp.newDataValidation()
    .requireValueInList(["-", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "未定"], true)
    .setAllowInvalid(true)
    .build();
  draftSheet.getRange("J3:J200").setDataValidation(ruleDiff);

  // 列幅の自動調整
  draftSheet.autoResizeColumns(1, headers.length);
  draftSheet.setColumnWidth(5, 260);

  // 「2.公演一覧」シートも存在確認またはリネーム
  let mainSheet = getMainSheet(ss);
  if (!mainSheet) {
    mainSheet = ss.insertSheet(SHEET_MAIN, 1);
  } else {
    mainSheet.setName(SHEET_MAIN);
  }

  // 上級者向け拡張列 (N〜S列: 14〜19列) をグループ化して初期折りたたみ
  const targetDraft = ss.getSheetByName(SHEET_DRAFT);
  if (targetDraft && targetDraft.getMaxColumns() >= 19) {
    try {
      const currentDepth = typeof targetDraft.getColumnGroupDepth === "function"
        ? targetDraft.getColumnGroupDepth(14)
        : 0;
      if (currentDepth === 0) {
        targetDraft.getRange(1, 14, 1, 6).shiftColumnGroupDepth(1);
      }
      targetDraft.collapseAllColumnGroups();
    } catch (_) {
      // 列グループ非対応や既存グループありの場合はスキップ
    }
  }

  // 「設定」シートを自動生成（なければ作成）し、全基本設定キー・GitHub連携キーを初期配置
  let configSheet = ss.getSheetByName(SHEET_CONFIG);
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEET_CONFIG, 2);
  }
  if (configSheet.getLastRow() === 0) {
    configSheet.getRange(1, 1, 1, 3).setValues([["設定項目", "設定値", "説明・入力例"]]);
    configSheet.getRange(1, 1, 1, 3).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");
    configSheet.setFrozenRows(1);
  }

  const configData = configSheet.getDataRange().getValues();
  const existingKeys = new Set(configData.map(r => String(r[0] || "").trim()));
  const configDefaults = [
    ["イベント名", "サンプル謎フェス タイムテーブル", "ページ見出し・ブラウザタイトルに使用"],
    ["サブタイトル", "2026.11.14 - 11.15 | MYSTERY FESTIVAL", "タイトル上部に表示される英字・日程帯"],
    ["開催日(YYYYMMDD)", "2026.11.14-11.15", "開催日程の表示文字列またはYYYYMMDD"],
    ["開催日数", "1", "1〜3などの日数（複数日の場合はステッパー有効化）"],
    ["1日目のラベル", "11/14(土)", "DAY 1 横に表示する日付ラベル"],
    ["2日目のラベル", "11/15(日)", "DAY 2 横に表示する日付ラベル（2日以上の場合）"],
    ["3日目のラベル", "", "DAY 3 横に表示する日付ラベル（3日以上の場合）"],
    ["開始時間(hh:mm)", "10:00", "タイムテーブル左軸の開始時刻"],
    ["終了時間(hh:mm)", "18:00", "タイムテーブル左軸の終了時刻"],
    ["タイムテーブルの刻み幅(分)", "30", "横罫線の刻み幅（通常は30）"],
    ["タイムテーブルメインカラー", "#5b21b6", "Web表示のテーマメインカラー (HEX)"],
    ["タイムテーブルアクセントカラー", "#facc15", "選択中カードの強調色 (HEX)"],
    ["0分移動可否", "0分移動NG", "0分移動NG（前後5分バッファ必須） / 0分移動OK"],
    ["完売公演の選択可否", "選択NG", "選択NG / 選択OK"],
    ["SNSハッシュタグ", "#謎解きタイムテーブル", "My ハシゴテーブル下部に表示するハッシュタグ"],
    ["SNSシェアテキスト", "", "Xシェア時の初期文面（未入力時はイベント名で自動生成）"],
    ["ヘッダー画像URL", "", "空欄時はデフォルト背景。GoogleドライブURLも指定可"],
    ["ロゴ画像URL", "", "My ハシゴテーブル上部に載せるロゴ画像URL（任意）"],
    ["チケット題字画像URL", "", "My ハシゴテーブルの題字（タイトル）部分を置き換える画像。メインビジュアル等（任意・空欄時は文字の題字）。GitHub の public フォルダに置いて ./ファイル名.png と書くのが最も確実（iPhone の画像保存でも欠けない）。GoogleドライブURLも可"],
    ["チケット箔の色", "#8a1c2b", "My ハシゴテーブルの外枠・題字・番号・ハッシュタグの色 (HEX)。傾けるとこの色の箔が光る"],
    ["チケット文字の色", "#252a40", "My ハシゴテーブルの本文・消印のインク色 (HEX)"],
    ["チケット紙の色", "#f4eedf", "My ハシゴテーブルの紙の色 (HEX)。明るい色を推奨"],
    ["会場マップURL", "", "（任意）会場のフロアマップと通路の設定ファイル（venue_map.json）のURL。設定すると、予定一覧に部屋から部屋への移動ルートが出る。空欄なら機能は出ない。作成は導入サポート側で行う"],
    ["非公開モード", "OFF", "OFF / 非公開モードON"],
    ["非公開モード:準備中メッセージ", "タイムテーブル準備中...", "非公開モードON時に表示する案内文"],
    ["GitHubリポジトリ", "", "例: owner/repo-name (Web公開JSON同期用)"],
    ["GitHubブランチ", "main", "同期先ブランチ名"],
    ["GitHub保存先パス", "public/data.json", "リポジトリ内の保存パス"],
    ["効果測定GAS URL", "", "利用レポート集計用のGAS WebアプリURL（/exec で終わるURL）"],
    ["GA4測定ID", "", "Google Analytics 4 測定ID（例: G-XXXXXXXXXX / 空欄時は無効）"]
  ];
  configDefaults.forEach(def => {
    if (!existingKeys.has(def[0])) {
      configSheet.appendRow([def[0], def[1], def[2]]);
    }
  });
  configSheet.autoResizeColumns(1, 3);

  ensureReportSheet(ss);
  renderReportSheet(ss);

  SpreadsheetApp.getUi().alert(
    "セットアップ完了",
    "「" + SHEET_DRAFT + "」シートをセットアップしました。\n\n" +
    "【ボタンの設置手順】\n" +
    "1. メニューの「挿入」>「描画」をクリック\n" +
    "2. 四角形を描き、「公演一覧に反映する」と入力して「保存して閉じる」\n" +
    "3. ボタンをD1セルの位置に配置し、右上のメニューから「スクリプトを割り当て」を選択\n" +
    "4. 「expandDraftToTimetable」と入力して確定してください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * 入力シートのデータを「2.公演一覧」シートへ展開
 * （図形描画ボタンまたはメニューから呼び出されます）
 */
function expandDraftToTimetable() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const draftSheet = ss.getSheetByName(SHEET_DRAFT) || 
                     ss.getSheetByName("① 公演かんたん入力") || 
                     ss.getSheetByName("入力補助シート");
  if (!draftSheet) {
    ui.alert("「" + SHEET_DRAFT + "」シートが見つかりません。先に初期セットアップを実行してください。");
    return;
  }

  // 本番シートの取得（なければ作成、既存があれば名前を統一）
  let mainSheet = getMainSheet(ss);
  if (!mainSheet) {
    mainSheet = ss.insertSheet(SHEET_MAIN, 1);
  } else {
    mainSheet.setName(SHEET_MAIN);
  }

  const lastRow = draftSheet.getLastRow();
  if (lastRow <= 2) {
    ui.alert("「" + SHEET_DRAFT + "」シートに公演データが入力されていません。3行目以降に入力してください。");
    return;
  }

  // 上書き・個別編集への注意喚起ダイアログ
  const res = ui.alert(
    "公演一覧への反映確認",
    "「" + SHEET_DRAFT + "」の内容を「" + SHEET_MAIN + "」へ展開します。\n\n" +
    "【ご注意】\n" +
    "「" + SHEET_MAIN + "」シートで個別に修正した内容（完売設定など）は上書きされます。\n" +
    "反映を実行してよろしいですか？",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  // 3行目以降のデータを取得
  const draftData = draftSheet.getRange(3, 1, lastRow - 2, 19).getValues();

  // 本番シート用のヘッダー定義
  const mainHeaders = [
    "日程", "団体名", "公演名", "会場(部屋)", "開始時間(hh:mm)",
    "所要時間(分)", "定員", "予約URL", "公演ビジュアルURL", "完売設定",
    "参加料金", "予約形式", "難易度", "内容目安", "所要時間:優先表示テキスト",
    "受付終了時間", "完全終了時間", "最終フェーズ表示名", "ノイズ演出", "南京錠パスワード"
  ];

  const expandedRows = [];

  draftData.forEach(row => {
    const day = row[0];
    const groupName = row[1];
    const title = row[2];
    const room = row[3];
    const timeListStr = String(row[4] || "").trim();
    const duration = row[5];
    const fee = row[6];
    const capacity = row[7];
    const reserveType = row[8] || "事前予約";
    const difficulty = row[9];
    const tags = row[10];
    const reserveUrl = row[11];
    const visualUrl = row[12];
    const overrideDurationText = row[13];
    const acceptEnd = row[14];
    const totalEnd = row[15];
    const phaseTitle = row[16];
    const noise = row[17];
    const password = row[18];

    // タイトルまたは団体名が空の行はスキップ
    if (!title && !groupName) return;

    // 開始時間リストのパース (単一時刻 / 時間帯範囲 10:00-12:00 / 随時対応)
    let timeSlots = [];
    if (timeListStr === "" || timeListStr === "随時") {
      timeSlots = [{ start: "随時", acceptEnd: acceptEnd }];
    } else {
      const normalizedTimeList = String(timeListStr || "")
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/：/g, ":")
        .replace(/\s*[-〜～~ー−–—]\s*/g, "-");
      const rawTokens = normalizedTimeList.split(/[\r\n,、\s]+/);
      rawTokens.forEach(t => {
        const token = t.trim();
        if (!token) return;
        const rangeMatch = token.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
        if (rangeMatch) {
          timeSlots.push({ start: rangeMatch[1], acceptEnd: rangeMatch[2] });
        } else {
          timeSlots.push({ start: token, acceptEnd: acceptEnd });
        }
      });
      if (timeSlots.length === 0) {
        timeSlots = [{
          start: reserveType === "当日受付(ファミレス式)" ? "随時" : "10:00",
          acceptEnd: acceptEnd
        }];
      }
    }

    // 各開始時間（または時間帯枠）ごとに1行展開
    timeSlots.forEach(slot => {
      expandedRows.push([
        day,                    // 日程
        groupName,              // 団体名
        title,                  // 公演名
        room,                   // 会場(部屋)
        slot.start,             // 開始時間(hh:mm)
        duration,               // 所要時間(分)
        capacity,               // 定員
        reserveUrl,             // 予約URL
        visualUrl,              // 公演ビジュアルURL
        "",                     // 完売設定 (初期値は空)
        fee,                    // 参加料金
        reserveType,            // 予約形式
        difficulty,             // 難易度
        tags,                   // 内容目安
        overrideDurationText,   // 所要時間:優先表示テキスト
        slot.acceptEnd,         // 受付終了時間
        totalEnd,               // 完全終了時間
        phaseTitle,             // 最終フェーズ表示名
        noise,                  // ノイズ演出
        password                // 南京錠パスワード
      ]);
    });
  });

  // 本番シートへ一括書き込み
  mainSheet.clearContents();
  mainSheet.getRange(1, 1, 1, mainHeaders.length).setValues([mainHeaders]);
  mainSheet.getRange(1, 1, 1, mainHeaders.length).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");
  mainSheet.setRowHeight(1, 35);
  mainSheet.setFrozenRows(1);

  if (expandedRows.length > 0) {
    const rowCount = expandedRows.length;
    mainSheet.getRange(2, 1, rowCount, mainHeaders.length).setValues(expandedRows);
    
    // プルダウン設定（展開後の公演一覧でも手動設定不要で自動付与）
    // 1. 日程 (A列)
    const ruleDay = SpreadsheetApp.newDataValidation()
      .requireValueInList(["1日目", "2日目", "3日目"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 1, rowCount, 1).setDataValidation(ruleDay);

    // 2. 完売設定 (J列)
    const ruleSoldOut = SpreadsheetApp.newDataValidation()
      .requireValueInList(["完売", "SOLD OUT", "空席あり"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 10, rowCount, 1).setDataValidation(ruleSoldOut);

    // 3. 予約形式 (L列)
    const ruleType = SpreadsheetApp.newDataValidation()
      .requireValueInList(["事前予約", "当日受付(ファミレス式)", "事前予約(時間自由)"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 12, rowCount, 1).setDataValidation(ruleType);

    // 4. 難易度 (M列)
    const ruleDiff = SpreadsheetApp.newDataValidation()
      .requireValueInList(["-", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "未定"], true)
      .setAllowInvalid(true)
      .build();
    mainSheet.getRange(2, 13, rowCount, 1).setDataValidation(ruleDiff);
  }

  mainSheet.autoResizeColumns(1, mainHeaders.length);

  // 利用レポートシートの公演マスタ・タグ一覧も最新化
  ensureReportSheet(ss);
  renderReportSheet(ss);

  // 展開後、「2.公演一覧」シートを前面に表示
  ss.setActiveSheet(mainSheet);

  ui.alert(
    "反映完了",
    draftData.filter(r => r[2]).length + " 件の公演情報から、計 " + expandedRows.length + " 行のタイムテーブルデータを「" + SHEET_MAIN + "」へ展開しました。\n\n" +
    "必要に応じて、この「" + SHEET_MAIN + "」シートで公演回ごとの完売設定や微調整を行ってください。",
    ui.ButtonSet.OK
  );

  // GitHub連携が設定されている場合は静的JSONを自動同期
  exportJsonToGitHub(true);
}

/**
 * スプレッドシートから最新のJSON用データ構造を生成
 */
function generateExportData(ss) {
  // 1. 設定シートの読み込み
  const configSheet = ss.getSheetByName(SHEET_CONFIG);
  const config = {};
  if (configSheet) {
    const configData = configSheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone() || "Asia/Tokyo";
    configData.forEach(row => {
      const key = String(row[0] || "").trim();
      if (!key || key === "設定項目") return;
      const val = row[1];
      if (val instanceof Date) {
        if (val.getFullYear() <= 1900 || key.indexOf("時間") !== -1) {
          config[key] = Utilities.formatDate(val, tz, "HH:mm");
        } else {
          config[key] = Utilities.formatDate(val, tz, "yyyy/MM/dd");
        }
      } else {
        config[key] = val !== undefined && val !== null ? String(val) : "";
      }
    });
  }

  // 2. 公演一覧シートの読み込み（過去の「公演データ」シート名にも完全互換対応）
  const mainSheet = getMainSheet(ss);
  const shows = [];
  
  if (mainSheet && mainSheet.getLastRow() > 1) {
    const data = mainSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const showObj = {};
      let hasData = false;
      
      headers.forEach((h, colIdx) => {
        if (h) {
          let val = row[colIdx];
          if (val instanceof Date) {
            const hours = String(val.getHours()).padStart(2, '0');
            const minutes = String(val.getMinutes()).padStart(2, '0');
            val = hours + ":" + minutes;
          }
          showObj[h] = val !== undefined && val !== null ? String(val).trim() : "";
          if (showObj[h]) hasData = true;
        }
      });
      
      if (hasData && (showObj["公演名"] || showObj["団体名"])) {
        shows.push(showObj);
      }
    }
  }

  return {
    config: config,
    shows: shows
  };
}

/**
 * Web API (doGet) - WebサイトへのJSONデータ配信（フォールバック用）
 */
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = generateExportData(ss);

  return ContentService.createTextOutput(JSON.stringify(result, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * GitHubアクセストークン（PAT）の設定
 */
function setupGitHubToken() {
  const ui = SpreadsheetApp.getUi();
  const prop = PropertiesService.getScriptProperties();
  const currentToken = prop.getProperty("GITHUB_PAT");
  const promptMsg = currentToken
    ? "現在GitHubアクセストークンが保存されています。\n新しいトークンを入力すると上書き更新されます:"
    : "GitHub Personal Access Token (PAT) を入力してください。\n（必要な権限: 対象リポジトリの Contents: Read and write）:";

  const res = ui.prompt("GitHubアクセストークン設定", promptMsg, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() === ui.Button.OK) {
    const token = res.getResponseText().trim();
    if (token) {
      prop.setProperty("GITHUB_PAT", token);
      ui.alert("設定完了", "アクセストークンを安全にスクリプトプロパティへ保存しました。", ui.ButtonSet.OK);
    } else {
      ui.alert("未入力", "トークンが入力されなかったため設定を保持しました。", ui.ButtonSet.OK);
    }
  }
}

/**
 * GitHubアクセストークン（PAT）の削除
 */
function clearGitHubToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert("確認", "保存されているGitHubアクセストークンを削除しますか？", ui.ButtonSet.YES_NO);
  if (res === ui.Button.YES) {
    PropertiesService.getScriptProperties().deleteProperty("GITHUB_PAT");
    ui.alert("削除完了", "アクセストークンを削除しました。", ui.ButtonSet.OK);
  }
}

/**
 * メニュー用：Web公開用JSONの手動同期実行
 */
function manualExportJsonToGitHub() {
  exportJsonToGitHub(false);
}

/**
 * スプレッドシートのデータを静的JSONとしてGitHubリポジトリへ直接コミット・同期
 * @param {boolean} isSilent - 自動同期時はtrue（エラーダイアログを抑制）
 */
function exportJsonToGitHub(isSilent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const prop = PropertiesService.getScriptProperties();
  let token = prop.getProperty("GITHUB_PAT");

  // トークン未設定時
  if (!token) {
    if (isSilent) return;
    const res = ui.prompt(
      "GitHubアクセストークンが必要です",
      "GitHub Personal Access Token (PAT) が設定されていません。\nトークンを入力してください（Contents: Read & write権限）:",
      ui.ButtonSet.OK_CANCEL
    );
    if (res.getSelectedButton() !== ui.Button.OK) return;
    token = res.getResponseText().trim();
    if (!token) return;
    prop.setProperty("GITHUB_PAT", token);
  }

  // 設定シートからGitHubリポジトリ設定を取得
  const configSheet = ss.getSheetByName(SHEET_CONFIG);
  let repo = "";
  let branch = "main";
  let filePath = "public/data.json";

  if (configSheet) {
    const data = configSheet.getDataRange().getValues();
    data.forEach(row => {
      const key = String(row[0] || "").trim();
      const val = String(row[1] !== undefined ? row[1] : "").trim();
      if (key === "GitHubリポジトリ" && val) repo = val;
      if (key === "GitHubブランチ" && val) branch = val;
      if (key === "GitHub保存先パス" && val) filePath = val;
    });
  }

  if (repo) {
    repo = repo
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/^\/+|\/+$/g, "");
  }

  if (!repo) {
    if (isSilent) return;
    ui.alert(
      "設定エラー",
      "「" + SHEET_CONFIG + "」シートに「GitHubリポジトリ」（例: owner/repo-name）が設定されていません。\n設定シートに入力してから再度実行してください。",
      ui.ButtonSet.OK
    );
    return;
  }

  try {
    // 1. 最新JSONデータの生成
    const exportData = generateExportData(ss);
    const jsonString = JSON.stringify(exportData, null, 2);
    const base64Content = Utilities.base64Encode(jsonString, Utilities.Charset.UTF_8);

    // 2. 既存ファイルのSHAを取得（GitHub APIでのファイル更新に必須）
    const apiUrl = "https://api.github.com/repos/" + repo + "/contents/" + filePath + "?ref=" + branch;
    const headers = {
      "Authorization": "token " + token,
      "Accept": "application/vnd.github+json",
      "User-Agent": "Universal-Timetable-GAS"
    };

    let existingSha = null;
    try {
      const getRes = UrlFetchApp.fetch(apiUrl, {
        method: "get",
        headers: headers,
        muteHttpExceptions: true
      });
      const getCode = getRes.getResponseCode();
      if (getCode === 200) {
        const fileJson = JSON.parse(getRes.getContentText());
        existingSha = fileJson.sha;
      }
    } catch (err) {
      console.warn("既存ファイルSHA取得失敗（新規作成として処理します）:", err);
    }

    // 3. GitHub API (PUT) でファイルを直接コミット
    const putPayload = {
      message: "data: タイムテーブルデータをスプレッドシートから自動同期",
      content: base64Content,
      branch: branch
    };
    if (existingSha) {
      putPayload.sha = existingSha;
    }

    const putUrl = "https://api.github.com/repos/" + repo + "/contents/" + filePath;
    const putRes = UrlFetchApp.fetch(putUrl, {
      method: "put",
      headers: headers,
      contentType: "application/json",
      payload: JSON.stringify(putPayload),
      muteHttpExceptions: true
    });

    const putCode = putRes.getResponseCode();
    if (putCode === 200 || putCode === 201) {
      if (!isSilent) {
        ui.alert(
          "GitHub同期完了",
          "リポジトリ「" + repo + "」（" + branch + " ブランチ）の " + filePath + " へ最新データを保存しました。\nWebサイト側が初回から0.1秒台で高速表示されます。",
          ui.ButtonSet.OK
        );
      }
    } else {
      const errorText = putRes.getContentText();
      console.error("GitHub API エラー:", putCode, errorText);
      if (!isSilent) {
        ui.alert(
          "GitHub同期エラー (HTTP " + putCode + ")",
          "同期に失敗しました。\n詳細: " + errorText,
          ui.ButtonSet.OK
        );
      }
    }
  } catch (e) {
    console.error("GitHub同期例外:", e);
    if (!isSilent) {
      ui.alert("同期処理例外", "処理中にエラーが発生しました: " + e.message, ui.ButtonSet.OK);
    }
  }
}


/**
 * 出展団体向け公演登録用の Google フォームを自動作成し、このスプレッドシートへ回答を連携する
 */
function createEntryForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const formTitle = (ss.getName() || "タイムテーブル") + " 出展公演登録フォーム";
  const form = FormApp.create(formTitle);

  form.setDescription("タイムテーブルに掲載する公演情報を入力してください。回答は管理シートへ取り込まれます。");

  form.addMultipleChoiceItem()
    .setTitle("日程")
    .setChoiceValues(["1日目", "2日目", "3日目"])
    .setRequired(true);

  form.addTextItem().setTitle("団体名").setRequired(true);
  form.addTextItem().setTitle("公演名").setRequired(true);
  form.addTextItem().setTitle("会場(部屋)").setHelpText("例: メインホール、201教室 など");

  form.addMultipleChoiceItem()
    .setTitle("予約形式")
    .setChoiceValues(["事前予約", "当日整理券", "当日受付(ファミレス式)"])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("開始時間リスト")
    .setHelpText("複数回ある場合は改行またはカンマ区切りで入力（例: 10:30, 12:30, 14:30）。終日随時受付は「随時」、途中に休止を挟む随時受付は「10:00-12:00, 13:00-18:00」のように時間帯で記入。")
    .setRequired(true);

  form.addTextItem().setTitle("所要時間(分)").setHelpText("半角数字で分数を入力（例: 60）").setRequired(true);
  form.addTextItem().setTitle("定員").setHelpText("例: 4名/回");
  form.addTextItem().setTitle("参加料金").setHelpText("例: 2500 または 無料");
  form.addTextItem().setTitle("難易度").setHelpText("1〜10 の数字");
  form.addTextItem().setTitle("内容目安").setHelpText("スラッシュや読点区切り（例: 初心者歓迎・ストーリー重視）");
  form.addTextItem().setTitle("予約URL").setHelpText("https:// で始まる案内URL");
  form.addTextItem().setTitle("公演ビジュアルURL").setHelpText("Googleドライブ共有リンクまたは画像URL");

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const props = PropertiesService.getDocumentProperties();
  props.setProperty("ENTRY_FORM_ID", form.getId());

  ui.alert(
    "登録フォームを作成しました",
    "回答先をこのスプレッドシートに設定しました。\n\n" +
      "回答用URL:\n" + form.getPublishedUrl() + "\n\n" +
      "編集用URL:\n" + form.getEditUrl(),
    ui.ButtonSet.OK
  );
}

/**
 * Googleフォームの回答シート内容を「1.公演かんたん入力」へ未取り込み分だけ追記する
 */
function importFormResponsesToDraft() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const draftSheet = ss.getSheetByName(SHEET_DRAFT) || ss.getSheetByName("① 公演かんたん入力");

  if (!draftSheet) {
    ui.alert("エラー", "「" + SHEET_DRAFT + "」シートが見つかりません。先にセットアップを実行してください。", ui.ButtonSet.OK);
    return;
  }

  const formSheet = ss.getSheets().find(s => s.getFormUrl() !== null || s.getName().indexOf("フォームの回答") !== -1);
  if (!formSheet) {
    ui.alert("確認", "リンクされたフォームの回答シートが見つかりません。", ui.ButtonSet.OK);
    return;
  }

  const respValues = formSheet.getDataRange().getValues();
  if (respValues.length <= 1) {
    ui.alert("確認", "取り込み対象のフォーム回答がまだありません。", ui.ButtonSet.OK);
    return;
  }

  const headers = respValues[0].map(h => String(h || "").trim());
  const colIdx = (name) => headers.indexOf(name);

  const draftData = draftSheet.getDataRange().getValues();
  const existingKeys = new Set();
  for (let i = 1; i < draftData.length; i++) {
    const key = [draftData[i][0], draftData[i][1], draftData[i][2]].map(v => String(v || "").trim()).join("|");
    if (key !== "||") existingKeys.add(key);
  }

  let addedCount = 0;
  for (let r = 1; r < respValues.length; r++) {
    const row = respValues[r];
    const getVal = (title) => {
      const idx = colIdx(title);
      return idx >= 0 ? String(row[idx] || "").trim() : "";
    };

    const day = getVal("日程") || "1日目";
    const groupName = getVal("団体名");
    const title = getVal("公演名");
    if (!title) continue;

    const dupKey = [day, groupName, title].join("|");
    if (existingKeys.has(dupKey)) continue;
    existingKeys.add(dupKey);

    draftSheet.appendRow([
      day,
      groupName,
      title,
      getVal("会場(部屋)"),
      getVal("開始時間リスト") || "10:00",
      getVal("所要時間(分)") || "60",
      getVal("参加料金"),
      getVal("定員"),
      getVal("予約形式") || "事前予約",
      getVal("難易度"),
      getVal("内容目安"),
      getVal("予約URL"),
      getVal("公演ビジュアルURL")
    ]);
    addedCount++;
  }

  ui.alert(
    "取り込み完了",
    addedCount > 0
      ? addedCount + "件の新規回答を「" + draftSheet.getName() + "」に取り込みました。「公演一覧へ反映する」を実行してタイムテーブルへ展開してください。"
      : "未取り込みの新規回答はありませんでした（同一日程・団体名・公演名はスキップされます）。",
    ui.ButtonSet.OK
  );
}


/**
 * ==========================================================================
 * 効果測定・利用レポート（人気タグランキング・公演別組込数集計）機能
 * ==========================================================================
 */

function getDefaultAnalyticsMeta() {
  return {
    totalPageViews: 0,
    openScheduleCount: 0,
    findGapsCount: 0,
    addGapShowCount: 0,
    viewPassCount: 0,
    saveImageCount: 0,
    copyPlanCount: 0,
    shareSnsCount: 0,
    filterTagCounts: {}
  };
}

/**
 * 内部集計用シート（_集計ログ）を初期化・取得
 */
function ensureRawLogSheet(ss) {
  let rawSheet = ss.getSheetByName(SHEET_RAW_LOG);
  if (!rawSheet) {
    rawSheet = ss.insertSheet(SHEET_RAW_LOG);
    rawSheet.hideSheet();
  }
  if (rawSheet.getLastRow() === 0 || !String(rawSheet.getRange(1, 1).getValue() || "").trim()) {
    rawSheet.getRange(1, 1).setValue(JSON.stringify(getDefaultAnalyticsMeta()));
  }
  if (rawSheet.getLastRow() < 2 || !String(rawSheet.getRange(2, 1).getValue() || "").trim()) {
    rawSheet.getRange(2, 1, 1, 5).setValues([[
      "visitorId", "selectedIdsJson", "updatedAt", "selectedTitlesJson", "tagCountsJson"
    ]]);
  }
  return rawSheet;
}

/**
 * 利用レポートシートを取得または作成
 */
function ensureReportSheet(ss) {
  let reportSheet = ss.getSheetByName(SHEET_REPORT);
  if (!reportSheet) {
    reportSheet = ss.insertSheet(SHEET_REPORT);
  }
  return reportSheet;
}

/**
 * 内容目安文字列をタグ配列へ分割（フロントエンド Parser.parseTags と同一ルール）
 */
function parseReportTags(rawText) {
  if (!rawText) return [];
  return String(rawText)
    .split(/[・、,/\n\r]+/)
    .map(function (t) { return t.trim(); })
    .filter(function (t) { return t.length > 0 && t !== "-" && t !== "特になし" && t !== "なし"; });
}

/**
 * Web アプリ POST 受信（doPost） - 行動計測と「利用レポート」更新
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    acquired = lock.tryLock(5000);
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "empty body" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const visitorId = String(payload.visitorId || "").trim();
    const action = String(payload.action || "").trim();

    if (!visitorId) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "missing visitorId" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawSheet = ensureRawLogSheet(ss);

    // 1. メタ集計カウンタ読込・更新
    let meta = getDefaultAnalyticsMeta();
    try {
      const rawMeta = String(rawSheet.getRange(1, 1).getValue() || "").trim();
      if (rawMeta) {
        const parsedMeta = JSON.parse(rawMeta);
        Object.keys(meta).forEach(function (k) {
          if (parsedMeta[k] !== undefined) meta[k] = parsedMeta[k];
        });
        if (!meta.filterTagCounts || typeof meta.filterTagCounts !== "object") {
          meta.filterTagCounts = {};
        }
      }
    } catch (_) {
      meta = getDefaultAnalyticsMeta();
    }

    if (action === "page_view") meta.totalPageViews += 1;
    else if (action === "open_schedule") meta.openScheduleCount += 1;
    else if (action === "find_gaps") meta.findGapsCount += 1;
    else if (action === "add_gap_show") meta.addGapShowCount += 1;
    else if (action === "view_pass") meta.viewPassCount += 1;
    else if (action === "save_image") meta.saveImageCount += 1;
    else if (action === "copy_plan") meta.copyPlanCount += 1;
    else if (action === "share_sns") meta.shareSnsCount += 1;
    else if (action === "filter_tag") {
      const ft = String(payload.filterTag || "").trim();
      if (ft) {
        meta.filterTagCounts[ft] = (meta.filterTagCounts[ft] || 0) + 1;
      }
    }

    rawSheet.getRange(1, 1).setValue(JSON.stringify(meta));

    // 2. 訪問者ごとの最新選択状態（3行目以降）を更新
    const lastRow = rawSheet.getLastRow();
    let targetRow = -1;
    if (lastRow >= 3) {
      const idValues = rawSheet.getRange(3, 1, lastRow - 2, 1).getValues();
      for (var i = 0; i < idValues.length; i++) {
        if (String(idValues[i][0] || "").trim() === visitorId) {
          targetRow = i + 3;
          break;
        }
      }
    }

    const nowIso = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    const shouldUpdatePlan = action !== "page_view" && action !== "filter_tag" && Array.isArray(payload.selectedIds);

    if (targetRow === -1) {
      const initIds = shouldUpdatePlan ? JSON.stringify(payload.selectedIds) : "[]";
      const initTitles = shouldUpdatePlan ? JSON.stringify(payload.selectedTitles || []) : "[]";
      const initTagCounts = shouldUpdatePlan ? JSON.stringify(payload.tagCounts || {}) : "{}";
      rawSheet.appendRow([visitorId, initIds, nowIso, initTitles, initTagCounts]);
    } else {
      rawSheet.getRange(targetRow, 3).setValue(nowIso);
      if (shouldUpdatePlan) {
        rawSheet.getRange(targetRow, 2).setValue(JSON.stringify(payload.selectedIds));
        rawSheet.getRange(targetRow, 4).setValue(JSON.stringify(payload.selectedTitles || []));
        rawSheet.getRange(targetRow, 5).setValue(JSON.stringify(payload.tagCounts || {}));
      }
    }

    renderReportSheet(ss);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error("doPost analytics error:", err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/**
 * メニュー用：利用レポートを再集計して前面表示
 */
function refreshAnalyticsReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = renderReportSheet(ss);
  ss.setActiveSheet(reportSheet);
  SpreadsheetApp.getUi().alert("更新完了", "「" + SHEET_REPORT + "」シートを最新データで更新しました。", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * メニュー用：集計ログとレポートをリセット
 */
function resetAnalyticsData() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    "利用レポート集計リセット確認",
    "これまで記録されたアクセス数・人気タグ・公演別選択数の集計データをすべて 0 に戻します。\nテストデータを消して本番公開前にリセットする場合に実行してください。\nよろしいですか？",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ensureRawLogSheet(ss);
  rawSheet.clearContents();
  rawSheet.getRange(1, 1).setValue(JSON.stringify(getDefaultAnalyticsMeta()));
  rawSheet.getRange(2, 1, 1, 5).setValues([[
    "visitorId", "selectedIdsJson", "updatedAt", "selectedTitlesJson", "tagCountsJson"
  ]]);
  renderReportSheet(ss);
  ui.alert("リセット完了", "利用レポートの集計データをリセットしました。", ui.ButtonSet.OK);
}

/**
 * 「利用レポート」シートへ全体サマリー・人気タグランキング・公演別ランキングを出力
 */
function renderReportSheet(ss) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ensureReportSheet(targetSs);
  const rawSheet = ensureRawLogSheet(targetSs);
  const mainSheet = getMainSheet(targetSs);

  // 1. 「2.公演一覧」からマスタ構築
  const showIdToMeta = {};
  const titleOrder = [];
  const titleInfoMap = {};
  const tagProgramSetMap = {};

  if (mainSheet && mainSheet.getLastRow() > 1) {
    const mainValues = mainSheet.getDataRange().getValues();
    const headers = mainValues[0].map(function (h) { return String(h || "").trim(); });
    const colDay = headers.indexOf("日程");
    const colGroup = headers.indexOf("団体名");
    const colTitle = headers.indexOf("公演名");
    const colTags = headers.indexOf("内容目安");

    var showIndex = 0;
    for (var r = 1; r < mainValues.length; r++) {
      var row = mainValues[r];
      var day = colDay >= 0 ? String(row[colDay] || "").trim() : "";
      var groupName = colGroup >= 0 ? String(row[colGroup] || "").trim() : "";
      var title = colTitle >= 0 ? String(row[colTitle] || "").trim() : "";
      var rawTags = colTags >= 0 ? String(row[colTags] || "").trim() : "";
      if (!title && !groupName) continue;

      showIndex += 1;
      var showId = "show-" + showIndex;
      var tags = parseReportTags(rawTags);
      showIdToMeta[showId] = { day: day, groupName: groupName, title: title, tags: tags };

      if (!titleInfoMap[title]) {
        titleInfoMap[title] = {
          day: day || "1日目",
          groupName: groupName,
          title: title,
          tags: {},
          tagList: []
        };
        titleOrder.push(title);
      }
      tags.forEach(function (t) {
        if (!titleInfoMap[title].tags[t]) {
          titleInfoMap[title].tags[t] = true;
          titleInfoMap[title].tagList.push(t);
        }
        if (!tagProgramSetMap[t]) tagProgramSetMap[t] = {};
        tagProgramSetMap[t][title] = true;
      });
    }
  }

  // 2. 「_集計ログ」からメトリクス集計
  let meta = getDefaultAnalyticsMeta();
  try {
    const metaStr = String(rawSheet.getRange(1, 1).getValue() || "").trim();
    if (metaStr) {
      const parsed = JSON.parse(metaStr);
      Object.keys(meta).forEach(function (k) {
        if (parsed[k] !== undefined) meta[k] = parsed[k];
      });
      if (!meta.filterTagCounts || typeof meta.filterTagCounts !== "object") {
        meta.filterTagCounts = {};
      }
    }
  } catch (_) {}

  var totalAccessUsers = 0;
  var planCreators = 0;
  var totalSelectedSlots = 0;
  var titleUserSetMap = {};
  var tagUserSetMap = {};
  var tagSlotCountMap = {};

  const rawLastRow = rawSheet.getLastRow();
  if (rawLastRow >= 3) {
    const logRows = rawSheet.getRange(3, 1, rawLastRow - 2, 5).getValues();
    logRows.forEach(function (row) {
      var visitorId = String(row[0] || "").trim();
      if (!visitorId) return;
      totalAccessUsers += 1;

      var ids = [];
      var savedTitles = [];
      var savedTagCounts = {};
      try { ids = JSON.parse(row[1] || "[]"); } catch (_) { ids = []; }
      try { savedTitles = JSON.parse(row[3] || "[]"); } catch (_) { savedTitles = []; }
      try { savedTagCounts = JSON.parse(row[4] || "{}"); } catch (_) { savedTagCounts = {}; }
      if (!Array.isArray(ids)) ids = [];
      if (!Array.isArray(savedTitles)) savedTitles = [];
      if (!savedTagCounts || typeof savedTagCounts !== "object") savedTagCounts = {};

      var slotCount = ids.length > 0 ? ids.length : savedTitles.length;
      if (slotCount > 0) {
        planCreators += 1;
        totalSelectedSlots += slotCount;
      }

      var resolvedAllIds = ids.length > 0 && ids.every(function (id) { return Boolean(showIdToMeta[id]); });
      var visitorTitleSet = {};
      var visitorTagCounts = {};

      if (resolvedAllIds) {
        ids.forEach(function (id) {
          var m = showIdToMeta[id];
          visitorTitleSet[m.title] = true;
          m.tags.forEach(function (t) {
            visitorTagCounts[t] = (visitorTagCounts[t] || 0) + 1;
          });
        });
      } else {
        savedTitles.forEach(function (t) {
          if (t) visitorTitleSet[t] = true;
        });
        Object.keys(savedTagCounts).forEach(function (t) {
          var c = Number(savedTagCounts[t]) || 0;
          if (c > 0) visitorTagCounts[t] = c;
        });
        // ID が部分的に一致するケースも補完
        ids.forEach(function (id) {
          var m = showIdToMeta[id];
          if (m) visitorTitleSet[m.title] = true;
        });
      }

      Object.keys(visitorTitleSet).forEach(function (title) {
        if (!titleUserSetMap[title]) titleUserSetMap[title] = {};
        titleUserSetMap[title][visitorId] = true;
        if (!titleInfoMap[title]) {
          titleInfoMap[title] = { day: "-", groupName: "-", title: title, tags: {}, tagList: [] };
          titleOrder.push(title);
        }
      });

      Object.keys(visitorTagCounts).forEach(function (tag) {
        if (!tagUserSetMap[tag]) tagUserSetMap[tag] = {};
        tagUserSetMap[tag][visitorId] = true;
        tagSlotCountMap[tag] = (tagSlotCountMap[tag] || 0) + (visitorTagCounts[tag] || 1);
      });
    });
  }

  var avgSelected = planCreators > 0 ? Math.round((totalSelectedSlots / planCreators) * 10) / 10 : 0;

  // 3. 人気タグランキングデータ構築
  var allTagSet = {};
  Object.keys(tagProgramSetMap).forEach(function (t) { allTagSet[t] = true; });
  Object.keys(tagUserSetMap).forEach(function (t) { allTagSet[t] = true; });
  Object.keys(meta.filterTagCounts || {}).forEach(function (t) { allTagSet[t] = true; });

  var tagRows = Object.keys(allTagSet).map(function (tag) {
    var uniqueUsers = tagUserSetMap[tag] ? Object.keys(tagUserSetMap[tag]).length : 0;
    var slotTotal = tagSlotCountMap[tag] || 0;
    var filterTaps = (meta.filterTagCounts && meta.filterTagCounts[tag]) ? meta.filterTagCounts[tag] : 0;
    var programCount = tagProgramSetMap[tag] ? Object.keys(tagProgramSetMap[tag]).length : 0;
    return { tag: tag, uniqueUsers: uniqueUsers, slotTotal: slotTotal, filterTaps: filterTaps, programCount: programCount };
  });

  tagRows.sort(function (a, b) {
    if (b.uniqueUsers !== a.uniqueUsers) return b.uniqueUsers - a.uniqueUsers;
    if (b.filterTaps !== a.filterTaps) return b.filterTaps - a.filterTaps;
    if (b.slotTotal !== a.slotTotal) return b.slotTotal - a.slotTotal;
    return b.programCount - a.programCount;
  });

  // 4. 公演別ハシゴ組込数ランキングデータ構築
  var programRows = titleOrder.map(function (title) {
    var info = titleInfoMap[title];
    var userCount = titleUserSetMap[title] ? Object.keys(titleUserSetMap[title]).length : 0;
    var rate = planCreators > 0 ? Math.round((userCount / planCreators) * 1000) / 10 : 0;
    return {
      day: info.day,
      groupName: info.groupName,
      title: info.title,
      tagStr: info.tagList.join(" / "),
      userCount: userCount,
      rateStr: rate.toFixed(1) + "%"
    };
  });

  programRows.sort(function (a, b) {
    return b.userCount - a.userCount;
  });

  // 5. 「利用レポート」シートへ描画
  reportSheet.clear();
  var updatedLabel = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");

  reportSheet.getRange("A1:J1").merge()
    .setValue("利用レポート・効果測定（依頼者報告・出展団体フィードバック用）  |  最終更新: " + updatedLabel)
    .setBackground("#1e1b4b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(11)
    .setVerticalAlignment("middle");
  reportSheet.setRowHeight(1, 34);

  // 【1. 全体利用サマリー】 A3:C15
  reportSheet.getRange("A3:C3").merge()
    .setValue("【1. 全体利用サマリー】")
    .setBackground("#ede9fe")
    .setFontColor("#4c1d95")
    .setFontWeight("bold");
  reportSheet.getRange("A4:C4").setValues([["指標名", "数値", "補足・報告用の見方"]])
    .setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");

  var summaryRows = [
    ["総アクセス人数（UU）", totalAccessUsers, "タイムテーブルページを開いたユニーク人数"],
    ["総ページ表示回数（PV）", meta.totalPageViews || 0, "ページが開かれた合計回数"],
    ["ハシゴ計画作成人数", planCreators, "1公演以上を選択して予定を組んだユニーク人数"],
    ["1人あたり平均選択公演数", avgSelected, "計画作成者1人あたりの平均ハシゴ公演数"],
    ["「自分の予定・ハシゴ表」確認回数", meta.openScheduleCount || 0, "予定一覧モーダルを開いた回数"],
    ["「スキマ時間探索」実行回数", meta.findGapsCount || 0, "空き時間に入れる公演を検索した回数"],
    ["スキマ候補からの公演追加回数", meta.addGapShowCount || 0, "検索結果の追加ボタンから回遊・追加された回数"],
    ["「My ハシゴテーブル」表示回数", meta.viewPassCount || 0, "ハシゴパス表示画面へ進んだ回数"],
    ["「My ハシゴテーブル」画像保存回数", meta.saveImageCount || 0, "画像として保存ボタンを押した回数"],
    ["「予定をコピー」実行回数", meta.copyPlanCount || 0, "共有URL付きテキストコピーの実行回数"],
    ["「SNSでシェア」実行回数", meta.shareSnsCount || 0, "SNSシェアボタンの実行回数"]
  ];
  reportSheet.getRange(5, 1, summaryRows.length, 3).setValues(summaryRows);
  reportSheet.getRange(5, 2, summaryRows.length, 1).setNumberFormat("#,##0");
  reportSheet.getRange(8, 2).setNumberFormat("0.0");
  reportSheet.getRange(4, 1, summaryRows.length + 1, 3).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  // 【2. 人気タグランキング】 E3:J...
  reportSheet.getRange("E3:J3").merge()
    .setValue("【2. 人気タグランキング（出展団体フィードバック用）】")
    .setBackground("#ede9fe")
    .setFontColor("#4c1d95")
    .setFontWeight("bold");
  reportSheet.getRange("E4:J4").setValues([[
    "順位", "タグ名", "ハシゴ組込人数(ユニーク)", "ハシゴ組込延べ枠数", "絞り込みタップ回数", "該当演目数"
  ]]).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");

  if (tagRows.length > 0) {
    var tagValues = tagRows.map(function (t, idx) {
      return [idx + 1, t.tag, t.uniqueUsers, t.slotTotal, t.filterTaps, t.programCount];
    });
    reportSheet.getRange(5, 5, tagValues.length, 6).setValues(tagValues);
    reportSheet.getRange(5, 7, tagValues.length, 4).setNumberFormat("#,##0");
    reportSheet.getRange(4, 5, tagValues.length + 1, 6).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  } else {
    reportSheet.getRange("E5:J5").merge().setValue("（「2.公演一覧」に内容目安タグが登録されると表示されます）");
  }

  // 【3. 公演別ハシゴ組込数ランキング】 A17〜（タグ数に応じて自動下方シフト）
  var progStartRow = Math.max(17, 5 + tagRows.length + 2);
  reportSheet.getRange(progStartRow, 1, 1, 7).merge()
    .setValue("【3. 公演別ハシゴ組込数ランキング（出展団体フィードバック用）】")
    .setBackground("#ede9fe")
    .setFontColor("#4c1d95")
    .setFontWeight("bold");
  reportSheet.getRange(progStartRow + 1, 1, 1, 7).setValues([[
    "順位", "日程", "団体名", "公演名", "内容目安タグ", "ハシゴ組込人数(ユニーク)", "組込率(対計画作成者)"
  ]]).setBackground("#1f2937").setFontColor("#ffffff").setFontWeight("bold");

  if (programRows.length > 0) {
    var progValues = programRows.map(function (p, idx) {
      return [idx + 1, p.day, p.groupName, p.title, p.tagStr, p.userCount, p.rateStr];
    });
    reportSheet.getRange(progStartRow + 2, 1, progValues.length, 7).setValues(progValues);
    reportSheet.getRange(progStartRow + 2, 6, progValues.length, 1).setNumberFormat("#,##0");
    reportSheet.getRange(progStartRow + 1, 1, progValues.length + 1, 7).setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  } else {
    reportSheet.getRange(progStartRow + 2, 1, 1, 7).merge().setValue("（「2.公演一覧」に公演が登録されると表示されます）");
  }

  reportSheet.autoResizeColumns(1, 10);
  reportSheet.setColumnWidth(4, 24);
  return reportSheet;
}
