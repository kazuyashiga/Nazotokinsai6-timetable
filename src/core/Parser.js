/**
 * 現場の自由記述・表記揺れを吸収・正規化するパーサー
 */
export class Parser {
  /**
   * HTML特殊文字をエスケープ
   */
  static escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Google Drive の共有リンクをサムネイル/直リンクURLに変換
   * - asThumbnail=true：タイムテーブル列のポスター用（表示幅 118px × 端末3倍密度でも足りる 480px 幅）
   * - asThumbnail=false：詳細カード用の高画質（2000px 幅）
   * 既に変換済みのサムネイルURLはそのまま返す（二重変換で列用の軽い画像が高画質に戻るのを防ぐ）
   */
  static convertDriveUrl(url, asThumbnail = false) {
    if (!url) return '';
    if (/^https:\/\/drive\.google\.com\/thumbnail\?/.test(url)) return url;
    let id = '';
    if (url.includes('drive.google.com')) {
      const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileDMatch) {
        id = fileDMatch[1];
      } else {
        const openIdMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (openIdMatch) {
          id = openIdMatch[1];
        }
      }
    }
    if (id) {
      const size = asThumbnail ? 'w480' : 'w2000';
      return `https://drive.google.com/thumbnail?id=${id}&sz=${size}`;
    }
    return url;
  }

  /**
   * 時間文字列 (HH:MM) を 00:00 からの経過分数に変換
   */
  static timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  /**
   * 00:00 からの経過分数を "HH:MM" 形式に変換
   */
  static minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * 所要時間のファジーパース
   */
  static parseDuration(rawDuration, overrideText = '') {
    const rawStr = String(rawDuration || '').trim();
    const match = rawStr.match(/\d+/);
    const min = match ? parseInt(match[0], 10) : 30;

    if (overrideText && String(overrideText).trim()) {
      return { durationMin: min, displayDuration: String(overrideText).trim() };
    }

    if (!rawStr) return { durationMin: 30, displayDuration: '30分' };
    const display = rawStr.includes('分') || rawStr.includes('時間') ? rawStr : `${rawStr}分`;
    return { durationMin: min, displayDuration: display };
  }

  /**
   * 難易度のファジーパース
   */
  static parseDifficulty(rawDifficulty) {
    const rawStr = String(rawDifficulty || '').trim();
    if (!rawStr || rawStr === '-' || rawStr === '未定' || rawStr === '非公開') {
      return { isNumeric: false, value: 0, displayText: rawStr || '未定' };
    }

    const num = parseInt(rawStr, 10);
    if (!isNaN(num) && num >= 1 && num <= 10) {
      return { isNumeric: true, value: num, displayText: String(num) };
    }

    return { isNumeric: false, value: 0, displayText: rawStr };
  }

  /**
   * 完売状態のファジー判定
   */
  static parseSoldOut(rawSoldOut) {
    const str = String(rawSoldOut || '').trim();
    if (!str) return false;
    const lower = str.toLowerCase();
    return lower !== 'false' && lower !== '0' && lower !== 'no' && lower !== '空席あり' && lower !== 'off';
  }

  /**
   * 内容目安・タグの自動分割
   */
  static parseTags(rawText) {
    if (!rawText) return [];
    return String(rawText)
      .split(/[・、,/\n\r]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && t !== '-' && t !== '特になし' && t !== 'なし');
  }

  /**
   * 単一の公演オブジェクトの正規化
   */
  static normalizeShow(rawShow, index) {
    const rawStart = String(rawShow['開始時間(hh:mm)'] || '10:00').trim();
    const normStart = rawStart
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/：/g, ':')
      .replace(/\s*[-〜～~ー−–—]\s*/g, '-');
    const rangeMatch = normStart.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    const inlineAcceptEnd = rangeMatch ? rangeMatch[2] : '';
    const acceptEndTime = String(rawShow['受付終了時間'] || inlineAcceptEnd || '').trim();
    const totalEndTime = String(rawShow['完全終了時間'] || '').trim();

    const reserveType = rawShow['予約形式'] || '';
    const isFlexibleTime =
      reserveType.includes('当日受付') ||
      reserveType.startsWith('当日') ||
      reserveType === '事前予約(時間自由)' ||
      normStart === '随時' ||
      Boolean(rangeMatch);

    const startTimeStr = normStart === '随時' ? '10:00' : (rangeMatch ? rangeMatch[1] : normStart);
    const startMinutes = this.timeToMinutes(startTimeStr);

    const { durationMin, displayDuration } = this.parseDuration(
      rawShow['所要時間(分)'],
      rawShow['所要時間:優先表示テキスト']
    );

    const flexEndStr = totalEndTime || acceptEndTime;
    let endMinutes;
    let endTimeStr;
    if (isFlexibleTime && flexEndStr && flexEndStr.includes(':')) {
      endTimeStr = flexEndStr;
      endMinutes = this.timeToMinutes(flexEndStr);
    } else {
      endMinutes = startMinutes + durationMin;
      endTimeStr = rawShow.endTime || this.minutesToTime(endMinutes);
    }

    const difficulty = this.parseDifficulty(rawShow['難易度']);
    const isSoldOut = this.parseSoldOut(rawShow['完売設定'] || rawShow['完売表示']);
    const tags = this.parseTags(rawShow['内容目安'] || rawShow['内容目安(雰囲気)']);

    const visualSrc = rawShow['公演ビジュアルURL'] || rawShow['ビジュアルURL'];
    const visualUrl = this.convertDriveUrl(visualSrc);
    const visualThumbnail = this.convertDriveUrl(visualSrc, true);

    return {
      id: rawShow.id || `show-${index + 1}`,
      raw: rawShow,
      day: rawShow['日程'] || '1日目',
      groupName: rawShow['団体名'] || rawShow['団体の名称'] || '',
      title: rawShow['公演名'] || rawShow['タイトル'] || '無題の公演',
      room: rawShow['会場(部屋)'] || rawShow['場所(階)'] || '未定',
      startTime: startTimeStr,
      endTime: endTimeStr,
      startMinutes,
      endMinutes,
      durationMin,
      displayDuration,
      capacity: rawShow['定員'] || '-',
      reserveUrl: rawShow['予約URL'] || '',
      visualUrl,
      visualThumbnail,
      isSoldOut,
      fee: rawShow['参加料金'] || rawShow['参加費'] || '',
      reserveType,
      isFlexibleTime,
      difficulty,
      tags,
      previewText: rawShow['プレビュー用テキスト'] || '',
      acceptEndTime,
      totalEndTime,
      noiseEffect: rawShow['ノイズ演出'] || '',
      password: rawShow['南京錠パスワード'] || rawShow['解除パスワード'] || '',
      finalPhaseTitle: rawShow['最終フェーズ表示名'] || ''
    };
  }

  /**
   * コンフィグの正規化
   */
  /**
   * 開始・終了時間の値（"10:00" や Date.toString() 由来文字列等）から "HH:mm" を抽出する
   */
  static extractTimeHHMM(rawVal, fallback = '10:00') {
    const str = String(rawVal || '').trim();
    const match = str.match(/(\d{1,2}):(\d{2})/);
    if (!match) return fallback;
    const h = String(parseInt(match[1], 10)).padStart(2, '0');
    return `${h}:${match[2]}`;
  }

  static normalizeConfig(rawConfig) {
    const rawDateStr = rawConfig['開催日(YYYYMMDD)'] || rawConfig['開催日'] || '';
    const mainColor = String(rawConfig['タイムテーブルメインカラー'] || '').trim() || '#5b21b6';
    const accentColor = String(rawConfig['タイムテーブルアクセントカラー'] || '').trim() || '#facc15';
    const startTimeStr = this.extractTimeHHMM(rawConfig['開始時間(hh:mm)'], '10:00');
    const endTimeStr = this.extractTimeHHMM(rawConfig['終了時間(hh:mm)'], '18:00');
    return {
      raw: rawConfig,
      title: rawConfig['イベント名'] || 'タイムテーブル',
      subtitle: rawConfig['サブタイトル'] || '',
      date: String(rawDateStr).replace(/[^a-zA-Z0-9-]/g, ''),
      displayDate: String(rawDateStr).trim(),
      startHour: parseInt(startTimeStr.split(':')[0], 10) || 10,
      endHour: parseInt(endTimeStr.split(':')[0], 10) || 18,
      headerUrl: rawConfig['ヘッダー画像URL'] || rawConfig['背景画像URL'] || '',
      stepMin: parseInt(rawConfig['タイムテーブルの刻み幅(分)'] || '30', 10) || 30,
      logoUrl: rawConfig['ロゴ画像URL'] || '',
      // My ハシゴテーブル（チケット）の題字画像と配色。空欄なら文字の題字・既定の配色
      ticketVisualUrl: String(rawConfig['チケット題字画像URL'] || '').trim(),
      ticketColors: {
        foil: String(rawConfig['チケット箔の色'] || '').trim(),
        ink: String(rawConfig['チケット文字の色'] || '').trim(),
        paper: String(rawConfig['チケット紙の色'] || '').trim()
      },
      hashtag: rawConfig['SNSハッシュタグ'] || '#ハッシュタグ',
      shareText: rawConfig['SNSシェアテキスト'] || '',
      allowZeroMinTransfer: String(rawConfig['0分移動可否'] || '').trim() === '0分移動OK',
      // 会場マップ（venue_map.json）の URL。空欄なら移動ルート機能は出さない
      venueMapUrl: String(rawConfig['会場マップURL'] || '').trim(),
      allowSoldOutSelect: String(rawConfig['完売公演の選択可否'] || '').trim() === '選択OK',
      isMaintenance: String(rawConfig['非公開モード'] || '').trim() === '非公開モードON',
      maintenanceMessage: rawConfig['非公開モード:準備中メッセージ'] || '只今準備中です。公開までしばらくお待ちください。',
      numDays: parseInt(rawConfig['開催日数'] || '1', 10) || 1,
      dayLabels: [
        rawConfig['1日目のラベル'] || rawConfig['1日目日程名称'] || 'Day 1',
        rawConfig['2日目のラベル'] || rawConfig['2日目日程名称'] || 'Day 2',
        rawConfig['3日目のラベル'] || rawConfig['3日目日程名称'] || 'Day 3'
      ],
      mainColor,
      accentColor,
      analyticsGasUrl: String(rawConfig['効果測定GAS URL'] || rawConfig['GAS WebアプリURL'] || '').trim(),
      ga4MeasurementId: String(rawConfig['GA4測定ID'] || '').trim(),
      themeTokens: {
        bg: String(rawConfig['テーマ背景色'] || '').trim(),
        surface: String(rawConfig['テーマカード色'] || '').trim(),
        main: mainColor,
        accent: accentColor
      }
    };
  }
}
