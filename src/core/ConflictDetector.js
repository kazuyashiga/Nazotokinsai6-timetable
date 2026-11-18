import { Parser } from './Parser.js';

/**
 * 公演のバッティング（時間重複・0分移動）判定およびスキマ時間探索ロジック
 */
export class ConflictDetector {
  /**
   * 固定時間枠でない（随時受付・時間自由）公演か判定
   */
  static isFlexibleShow(show) {
    if (!show) return false;
    return Boolean(
      show.isFlexibleTime ||
      show.reserveType === '当日受付(ファミレス式)' ||
      show.reserveType === '事前予約(時間自由)' ||
      (show.reserveType && show.reserveType.includes('当日受付'))
    );
  }

  /**
   * 2つの公演が時間重複しているかを判定
   */
  static isOverlapping(show1, show2, allowZeroMinTransfer = false) {
    if (!show1 || !show2) return false;
    if (show1.day !== show2.day) return false;
    if (this.isFlexibleShow(show1) || this.isFlexibleShow(show2)) return false;

    const s1 = show1.startMinutes;
    const e1 = show1.endMinutes;
    const s2 = show2.startMinutes;
    const e2 = show2.endMinutes;

    if (allowZeroMinTransfer) {
      return (s1 < e2 && e1 > s2) || (s2 < e1 && e2 > s1);
    }
    return (s1 <= e2 && e1 >= s2) || (s2 <= e1 && e2 >= s1);
  }

  /**
   * 選択された全公演の中から、重複している公演IDのSetを返す
   */
  static findConflicts(selectedIds, showsMap, allowZeroMinTransfer = false) {
    const conflictIds = new Set();

    for (let i = 0; i < selectedIds.length; i++) {
      const id1 = selectedIds[i];
      const s1 = showsMap.get(id1);
      if (!s1) continue;

      for (let j = i + 1; j < selectedIds.length; j++) {
        const id2 = selectedIds[j];
        const s2 = showsMap.get(id2);
        if (!s2) continue;

        if (this.isOverlapping(s1, s2, allowZeroMinTransfer)) {
          conflictIds.add(id1);
          conflictIds.add(id2);
        }
      }
    }

    return {
      conflictIds,
      hasConflict: conflictIds.size > 0
    };
  }

  /**
   * 選択中の固定枠公演の合間に挟めるスキマ時間区間と候補公演リストを算出する
   * @param {Array<Object>} selectedShowsForDay 選択中の該当日の全公演
   * @param {Array<Object>} allShowsForDay 該当日の全公演
   * @param {Set<string>} selectedIdsSet 選択済みID集合
   * @param {boolean} allowZeroMinTransfer 0分移動許可フラグ（false時は前後5分バッファ必須）
   * @returns {Map<string, { gapStart: number, gapEnd: number, gapMin: number, startStr: string, endStr: string, candidates: Array<Object> }>}
   */
  static findGapOpportunities(selectedShowsForDay, allShowsForDay, selectedIdsSet, allowZeroMinTransfer = false) {
    const gapsByPrevShowId = new Map();
    const timedSelected = (selectedShowsForDay || [])
      .filter(s => s && !this.isFlexibleShow(s))
      .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

    if (timedSelected.length < 2) return gapsByPrevShowId;

    const bufferMin = allowZeroMinTransfer ? 0 : 5;

    for (let i = 0; i < timedSelected.length - 1; i++) {
      const curr = timedSelected[i];
      const next = timedSelected[i + 1];
      const gapStart = curr.endMinutes;
      const gapEnd = next.startMinutes;
      const gapMin = gapEnd - gapStart;

      if (gapMin < 30) continue;

      const effectiveStart = gapStart + bufferMin;
      const effectiveEnd = gapEnd - bufferMin;
      const seenFlexTitles = new Set();

      const candidates = (allShowsForDay || []).filter(c => {
        if (!c || selectedIdsSet.has(c.id) || c.isSoldOut) return false;
        if (this.isFlexibleShow(c)) {
          const flexStart = c.startMinutes || 0;
          const flexEndStr = c.acceptEndTime || c.totalEndTime || '';
          const flexEnd = flexEndStr.includes(':') ? Parser.timeToMinutes(flexEndStr) : 24 * 60;
          const overlapStart = Math.max(effectiveStart, flexStart);
          const overlapEnd = Math.min(effectiveEnd, flexEnd);
          if (overlapEnd - overlapStart < (c.durationMin || 30)) return false;
          if (seenFlexTitles.has(c.title)) return false;
          seenFlexTitles.add(c.title);
          return true;
        }
        return c.startMinutes >= effectiveStart && c.endMinutes <= effectiveEnd;
      }).sort((a, b) => {
        const aFlex = this.isFlexibleShow(a) ? 1 : 0;
        const bFlex = this.isFlexibleShow(b) ? 1 : 0;
        if (aFlex !== bFlex) return aFlex - bFlex;
        return a.startMinutes - b.startMinutes;
      });

      gapsByPrevShowId.set(curr.id, {
        gapStart,
        gapEnd,
        gapMin,
        startStr: curr.endTime || Parser.minutesToTime(gapStart),
        endStr: next.startTime || Parser.minutesToTime(gapEnd),
        candidates
      });
    }

    return gapsByPrevShowId;
  }
}
