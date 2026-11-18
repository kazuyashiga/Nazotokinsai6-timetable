import { Parser } from '../core/Parser.js';
import { ConflictDetector } from '../core/ConflictDetector.js';

/**
 * 下部選択バー（0件時は非表示、選択時にせり出して視線誘導）
 */
export class SelectionBar {
  constructor({ onRemoveShow, onClearAll, onOpenSchedule }) {
    this.onRemoveShow = onRemoveShow;
    this.onClearAll = onClearAll;
    this.onOpenSchedule = onOpenSchedule;
    this._prevIds = new Set();
    this._prevCount = 0;
    this._bindEvents();
  }

  _prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 公演数の数字を下からポンと差し替える（バー表示中に件数が変わったときのみ）
   */
  _bumpCount(countEl) {
    if (!countEl || typeof countEl.animate !== 'function' || this._prefersReducedMotion()) return;
    const keyframes = [
      { transform: 'translateY(55%) scale(0.85)', opacity: 0 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ];
    // Web Animations は CSS 変数を解決しないため、トークンの実値を読み出して渡す
    const springPop = getComputedStyle(document.documentElement)
      .getPropertyValue('--ease-spring-pop').trim();
    try {
      countEl.animate(keyframes, { duration: 420, easing: springPop || 'ease-out' });
    } catch (_) {
      // linear() 非対応環境は近いオーバーシュートの cubic-bezier で代替
      countEl.animate(keyframes, { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    }
  }

  _bindEvents() {
    const chipsRow = document.getElementById('selected-chips-row');
    if (chipsRow) {
      chipsRow.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.chip-remove');
        if (!removeBtn) return;
        const showId = removeBtn.getAttribute('data-show-id');
        if (showId && this.onRemoveShow) {
          this.onRemoveShow(showId, e);
        }
      });
    }

    const resetBtn = document.getElementById('selection-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.onClearAll) this.onClearAll();
      });
    }

    const openBtn = document.getElementById('open-schedule-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (this.onOpenSchedule) this.onOpenSchedule();
      });
    }
  }

  render(selectedIds, showsMap, conflictIds, activeDay) {
    const bar = document.getElementById('selection-bar');
    const chipsEl = document.getElementById('selected-chips-row');
    const alertEl = document.getElementById('selection-conflict-alert');
    const ctaTextEl = document.getElementById('selection-cta-text');
    if (!bar || !chipsEl) return;

    if (!selectedIds || selectedIds.length === 0) {
      bar.classList.add('is-hidden');
      chipsEl.innerHTML = '';
      if (alertEl) alertEl.classList.add('hidden');
      this._prevIds = new Set();
      this._prevCount = 0;
      return;
    }

    const wasHidden = bar.classList.contains('is-hidden');
    bar.classList.remove('is-hidden');

    const items = selectedIds
      .map(id => showsMap.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        if (a.day !== b.day) return a.day.localeCompare(b.day, undefined, { numeric: true });
        return a.startMinutes - b.startMinutes;
      });

    if (alertEl) {
      alertEl.classList.toggle('hidden', conflictIds.size === 0);
    }

    // バーが既に出ている状態で新しく加わったチップだけを登場アニメーションさせる
    const newIds = wasHidden
      ? new Set()
      : new Set(items.filter(s => !this._prevIds.has(s.id)).map(s => s.id));

    chipsEl.innerHTML = items.map(s => {
      const isConf = conflictIds.has(s.id);
      const isNew = newIds.has(s.id);
      const timeText = ConflictDetector.isFlexibleShow(s) ? '随時' : s.startTime;
      const dayPrefix = s.day !== activeDay ? `[${s.day}] ` : '';
      return `
        <div class="selected-chip ${isConf ? 'is-conflict' : ''} ${isNew ? 'is-entering' : ''}" data-show-id="${Parser.escapeHtml(s.id)}">
          <span class="chip-time">${Parser.escapeHtml(dayPrefix + timeText)}</span>
          <span class="chip-name">${Parser.escapeHtml(s.title)}</span>
          <button type="button" class="chip-remove" data-show-id="${Parser.escapeHtml(s.id)}" aria-label="${Parser.escapeHtml(s.title)}を外す">×</button>
        </div>`;
    }).join('');

    // 追加したチップが横スクロールの外にあれば、見える位置までスッと寄せる
    const enteringChip = chipsEl.querySelector('.selected-chip.is-entering');
    if (enteringChip && typeof chipsEl.scrollTo === 'function') {
      const rowRect = chipsEl.getBoundingClientRect();
      const chipRect = enteringChip.getBoundingClientRect();
      const target = chipsEl.scrollLeft + (chipRect.left - rowRect.left) - (rowRect.width - chipRect.width) / 2;
      chipsEl.scrollTo({
        left: Math.max(0, target),
        behavior: this._prefersReducedMotion() ? 'auto' : 'smooth'
      });
    }

    if (ctaTextEl) {
      ctaTextEl.textContent = 'My ハシゴテーブルを見る';
      const countEl = document.createElement('span');
      countEl.className = 'cta-count';
      countEl.textContent = `（${items.length}公演）`;
      ctaTextEl.appendChild(countEl);
      if (!wasHidden && items.length !== this._prevCount) {
        this._bumpCount(countEl);
      }
    }

    this._prevIds = new Set(items.map(s => s.id));
    this._prevCount = items.length;
  }
}
