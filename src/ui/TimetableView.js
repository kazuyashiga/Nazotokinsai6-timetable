import { Parser } from '../core/Parser.js';
import { ConflictDetector } from '../core/ConflictDetector.js';

const LOCK_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const CHECK_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>';

/**
 * 全体タイムテーブル（標準サイズ統一・左縦ライン廃止・場所非表示）の描画とイベント管理
 */
export class TimetableView {
  constructor(callbacks) {
    this.config = {};
    this.PIXELS_PER_HOUR = 74;
    this.onToggleShow = callbacks.onToggleShow;
    this.onPromptLock = callbacks.onPromptLock;
    this.onOpenSpec = callbacks.onOpenSpec;
    this._bindEvents();
  }

  _bindEvents() {
    const grid = document.getElementById('timetable-grid');
    if (!grid) return;

    grid.addEventListener('click', (e) => {
      // 「詳細」ボタンとメインビジュアルのどちらからでも詳細ポップオーバーを開く
      const specBtn = e.target.closest('.spec-pill-btn, .visual-tap-btn');
      if (specBtn) {
        const showId = specBtn.getAttribute('data-spec-show-id');
        if (showId && this.onOpenSpec) {
          // popovertarget による即時表示を止め、拡がる遷移付きで開く
          e.preventDefault();
          this.onOpenSpec(showId, specBtn);
        }
        return;
      }

      const lockBtn = e.target.closest('.lock-trigger-btn');
      if (lockBtn) {
        e.stopPropagation();
        const groupKey = lockBtn.getAttribute('data-group-key');
        const encrypted = lockBtn.getAttribute('data-encrypted') || '';
        if (this.onPromptLock) {
          this.onPromptLock(groupKey, encrypted, e);
        }
        return;
      }

      const cardBtn = e.target.closest('.show-card');
      if (cardBtn) {
        if (cardBtn.classList.contains('card-locked-action')) {
          const groupKey = cardBtn.getAttribute('data-group-key');
          const encrypted = cardBtn.getAttribute('data-encrypted') || '';
          if (this.onPromptLock) {
            this.onPromptLock(groupKey, encrypted, e);
          }
          return;
        }
        const showId = cardBtn.getAttribute('data-show-id');
        if (showId && this.onToggleShow) {
          this._setTapOrigin(cardBtn, e);
          const wasSelected = cardBtn.classList.contains('is-selected');
          this.onToggleShow(showId, e);
          if (!wasSelected && cardBtn.classList.contains('is-selected')) {
            this._playPop(cardBtn);
          }
        }
      }
    });
  }

  /**
   * 塗りが広がる起点（指の位置）をカード内座標で記録する。キーボード操作時は中央から。
   */
  _setTapOrigin(card, e) {
    const rect = card.getBoundingClientRect();
    const fromPointer = e && e.detail > 0 && rect.width > 0 && rect.height > 0;
    const x = fromPointer ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
    const y = fromPointer ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
    card.style.setProperty('--tap-x', `${Math.min(100, Math.max(0, x)).toFixed(1)}%`);
    card.style.setProperty('--tap-y', `${Math.min(100, Math.max(0, y)).toFixed(1)}%`);
  }

  /**
   * 選択した瞬間だけの弾み（is-pop）を一度だけ再生する
   */
  _playPop(card) {
    card.classList.remove('is-pop');
    // 連打時もアニメーションを頭から再生し直すため、クラスを外した状態をいったん確定させる
    void card.offsetWidth;
    card.classList.add('is-pop');
    card.addEventListener('animationend', () => card.classList.remove('is-pop'), { once: true });
  }

  setConfig(config) {
    this.config = config || {};
    this.renderTimeAxis();
  }

  renderTimeAxis() {
    const axis = document.getElementById('time-axis-col');
    if (!axis) return;
    const startHour = this.config.startHour ?? 10;
    const endHour = this.config.endHour ?? 18;
    let html = '';
    for (let h = startHour; h <= endHour; h++) {
      html += `<div class="time-slot-label">${h}:00</div>`;
    }
    axis.innerHTML = html;
  }

  _formatFee(feeVal) {
    const raw = String(feeVal ?? '').trim();
    if (!raw || raw === '-') return '料金未定';
    if (/^\d+$/.test(raw)) {
      return `${Number(raw).toLocaleString('ja-JP')}円`;
    }
    return raw;
  }

  _buildVisualHtml(base, isHeaderNoise) {
    const imageUrl = base.visualThumbnail || base.visualUrl;
    if (!imageUrl) {
      // 画像未登録時は見出し・情報行と重複する公演名・団体名・所要時間を載せず、NoVisual 表記のみ
      return `
        <div class="visual-placeholder">
          <div class="visual-placeholder-none" aria-hidden="true">NoVisual</div>
        </div>
      `;
    }
    // 列のポスターは軽いサムネイル（480px 幅）。横スクロールの外の列は見えるまで読み込まない
    const convertedUrl = Parser.convertDriveUrl(imageUrl, true);
    const noiseCls = isHeaderNoise ? ' mystic-text' : '';
    // 枠と形の合わないポスターは、上下（左右）の余白をそのポスターをぼかしたもので埋める（黒い帯を出さない）
    const safeUrl = Parser.escapeHtml(convertedUrl);
    return `<span class="program-visual">
      <span class="program-visual-fill" style="background-image:url(&quot;${safeUrl}&quot;)" aria-hidden="true"></span>
      <img src="${safeUrl}" class="program-visual-img${noiseCls}" alt="${Parser.escapeHtml(base.title)}" loading="lazy" decoding="async">
    </span>`;
  }

  _buildReserveButtonHtml(base, isFlexible, hasLock, isHeaderNoise, groupKey, lockPassword, reserveUrl) {
    if (isFlexible) {
      return '<span class="reserve-link-btn is-onsite">当日現地受付</span>';
    }
    if (hasLock) {
      return `<button type="button" class="reserve-link-btn is-locked lock-trigger-btn" data-group-key="${Parser.escapeHtml(groupKey)}" data-encrypted="${Parser.escapeHtml(lockPassword)}">${LOCK_SVG}<span>LOCKED</span></button>`;
    }
    if (isHeaderNoise) {
      return '<span class="reserve-link-btn is-locked">LOCKED</span>';
    }
    if (reserveUrl) {
      return `<a href="${Parser.escapeHtml(reserveUrl)}" target="_blank" rel="noopener noreferrer" class="reserve-link-btn">予約ページ</a>`;
    }
    return '<span class="reserve-link-btn is-spacer" aria-hidden="true">-</span>';
  }

  _computeCardGeometry(show, isFlexible, startHour, endHour) {
    const startMin = show.startMinutes;
    let endMin = show.endMinutes;

    if (isFlexible && !show.durationMin) {
      endMin = (endHour + 1) * 60;
    }

    const acceptEndMin = show.acceptEndTime && show.acceptEndTime.includes(':')
      ? Parser.timeToMinutes(show.acceptEndTime)
      : null;
    const totalEndMin = show.totalEndTime && show.totalEndTime.includes(':')
      ? Parser.timeToMinutes(show.totalEndTime)
      : null;

    let phaseHeight = 0;
    if (totalEndMin !== null && acceptEndMin !== null) {
      if (totalEndMin <= acceptEndMin) {
        endMin = Math.max(totalEndMin, acceptEndMin);
      } else {
        endMin = totalEndMin;
        phaseHeight = Math.max(0, (totalEndMin - acceptEndMin) * (this.PIXELS_PER_HOUR / 60) - 1);
      }
    } else if (totalEndMin !== null) {
      endMin = totalEndMin;
    } else if (acceptEndMin !== null) {
      endMin = acceptEndMin;
    } else if (isFlexible) {
      endMin = Math.max(endMin, startMin + 90);
    }

    const topPx = ((startMin - startHour * 60) / 60) * this.PIXELS_PER_HOUR;
    const heightPx = Math.max(34, ((endMin - startMin) / 60) * this.PIXELS_PER_HOUR - 2);
    return { topPx, heightPx, endMin, phaseHeight };
  }

  render(shows, { unlockedShows = new Set(), unlockedUrls = {}, selectedIds = [], conflictIds = new Set(), isMatchFn = () => true } = {}) {
    const section = document.getElementById('timetable-section');
    const grid = document.getElementById('timetable-grid');
    if (section) section.classList.remove('hidden');
    if (!grid) return;

    this.renderTimeAxis();
    const startHour = this.config.startHour ?? 10;
    const endHour = this.config.endHour ?? 18;
    const slotAreaHeight = (endHour - startHour + 1) * this.PIXELS_PER_HOUR;
    const selectedSet = new Set(selectedIds);
    // 絞り込み（難易度・タグ）に合わない公演は列ごと隠す（薄くするだけだと、何十公演も横に並んだ時に比べにくいため）
    const titles = [...new Set(shows.map(s => s.title))]
      .filter(Boolean)
      .filter(title => isMatchFn(shows.find(s => s.title === title)));

    if (titles.length === 0) {
      grid.innerHTML = '<div style="padding:36px 20px; font-size:12px; font-weight:800; color:var(--fes-muted);">この日程・条件で表示できる公演はありません。</div>';
      return;
    }

    grid.innerHTML = titles.map((title, index) => {
      const groupShows = shows.filter(s => s.title === title);
      const base = groupShows[0];
      const isFlexible = ConflictDetector.isFlexibleShow(base);
      const isHeaderNoise = base.noiseEffect === true || String(base.noiseEffect).toUpperCase() === 'TRUE';

      const groupKey = String(base.id || index);
      const isGroupUnlocked = unlockedShows.has(groupKey);
      const lockRaw = String(base.password || '');
      const hasLock = lockRaw !== '' && !isGroupUnlocked;
      const reserveUrl = isGroupUnlocked && unlockedUrls[groupKey] ? unlockedUrls[groupKey] : base.reserveUrl;

      const summaryParts = [base.displayDuration, base.capacity && base.capacity !== '-' ? base.capacity : '']
        .filter(Boolean)
        .join('・');

      const cardsHtml = groupShows.map(show => {
        if (!show.startTime) return '';
        const showFlexible = ConflictDetector.isFlexibleShow(show);
        const { topPx, heightPx, endMin, phaseHeight } = this._computeCardGeometry(show, showFlexible, startHour, endHour);

        const isCardNoise = show.noiseEffect === true || String(show.noiseEffect).toUpperCase() === 'TRUE';
        const showLockRaw = String(show.password || '');
        const isCardLock = showLockRaw !== '' && !isGroupUnlocked;

        const isSel = selectedSet.has(show.id);
        const isConf = conflictIds.has(show.id);
        const soldOutClass = show.isSoldOut
          ? `is-sold-out ${this.config.allowSoldOutSelect ? 'is-selectable' : ''}`
          : '';

        const timeLabel = showFlexible
          ? `随時受付<span class="card-time-sub">(${show.startTime}-${Parser.minutesToTime(endMin)})</span>`
          : `${show.startTime}-${show.endTime || Parser.minutesToTime(endMin)}`;

        const phaseHtml = phaseHeight > 0
          ? `<div class="final-phase-block" style="height:${phaseHeight}px;">${Parser.escapeHtml(show.finalPhaseTitle || '受付終了')}</div>`
          : '';

        const noiseLayer = isCardNoise ? '<div class="mystic-shimmer"></div>' : '';
        const lockBadge = isCardLock && !isCardNoise ? `<span class="card-lock-badge">${LOCK_SVG}</span>` : '';
        const soldOutStamp = show.isSoldOut ? '<span class="sold-out-stamp">SOLD OUT</span>' : '';
        const extraBottomStyle = phaseHeight > 0 ? ` padding-bottom:${phaseHeight + 2}px;` : '';

        return `
          <button type="button"
            id="card-${Parser.escapeHtml(show.id)}"
            data-show-id="${Parser.escapeHtml(show.id)}"
            data-group-key="${Parser.escapeHtml(groupKey)}"
            data-encrypted="${Parser.escapeHtml(showLockRaw)}"
            class="show-card ${isSel ? 'is-selected' : ''} ${isConf ? 'is-conflict' : ''} ${soldOutClass} ${isCardLock ? 'card-locked-state card-locked-action' : ''}"
            style="top:${topPx}px; height:${heightPx}px;${extraBottomStyle}"
            ${isCardNoise ? 'disabled' : ''}>
            <span class="card-fill" aria-hidden="true"></span>
            ${noiseLayer}
            ${lockBadge}
            <span class="selected-check-badge">${CHECK_SVG}</span>
            <div class="card-time ${isCardNoise ? 'mystic-text' : ''}">${timeLabel}</div>
            ${soldOutStamp}
            ${phaseHtml}
          </button>
        `;
      }).join('');

      const feeText = this._formatFee(base.fee);

      return `
        <div class="venue-col" style="background-size: 100% ${Math.max(12, ((this.config.stepMin || 30) / 60) * this.PIXELS_PER_HOUR)}px;">
          <div class="col-header">
            ${isHeaderNoise ? '<div class="mystic-shimmer"></div>' : ''}
            <div>
              <span class="group-badge">${Parser.escapeHtml(base.groupName || '出展団体')}</span>
              <h3 class="show-title ${isHeaderNoise ? 'mystic-text' : ''}">${Parser.escapeHtml(base.title)}</h3>
            </div>
            <button type="button"
              class="visual-tap-btn"
              popovertarget="spec-popover"
              data-spec-show-id="${Parser.escapeHtml(base.id)}"
              aria-label="${Parser.escapeHtml(base.title || '公演')}の詳細を見る">
              ${this._buildVisualHtml(base, isHeaderNoise)}
            </button>
            <button type="button"
              class="spec-pill-btn"
              popovertarget="spec-popover"
              data-spec-show-id="${Parser.escapeHtml(base.id)}">
              <span class="spec-pill-info">
                <span class="spec-pill-text">${Parser.escapeHtml(summaryParts || '公演仕様')}</span>
                <span class="spec-pill-fee">${Parser.escapeHtml(feeText)}</span>
              </span>
              <span class="spec-pill-chevron">詳細 ▸</span>
            </button>
            ${this._buildReserveButtonHtml(base, isFlexible, hasLock, isHeaderNoise, groupKey, lockRaw, reserveUrl)}
          </div>
          <div class="col-slots" style="height:${slotAreaHeight}px;">${cardsHtml}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * 選択・重複状態のみを再描画なしで即時反映
   */
  updateSelectionVisuals(selectedIds, conflictIds) {
    const selectedSet = new Set(selectedIds);
    document.querySelectorAll('#timetable-grid .show-card').forEach(card => {
      const id = card.getAttribute('data-show-id');
      card.classList.toggle('is-selected', selectedSet.has(id));
      card.classList.toggle('is-conflict', conflictIds.has(id));
    });
  }
}
