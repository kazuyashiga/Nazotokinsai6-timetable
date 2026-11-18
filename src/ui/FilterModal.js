import { Parser } from '../core/Parser.js';
import { Analytics } from '../core/Analytics.js';
import { closeTopLayer } from './motion.js';

/**
 * 「絞り込み・便利機能」モーダル（難易度・機会均等タグ・折りたたみ既プレイ除外）
 * ※ 表示サイズ切替UIは設けない（標準サイズ一本化）
 */
export class FilterModal {
  constructor({ onFilterChange, onExcludeChange }) {
    this.onFilterChange = onFilterChange;
    this.onExcludeChange = onExcludeChange;
    this.shows = [];
    this.filterTargetDiff = 'ALL';
    this.filterDiffOp = 'GTE';
    this.currentDiffVal = 3;
    this.selectedFilterTags = new Set();
    this.excludedTitles = new Set();
    this.allExtractedTags = [];
    this.tagRotationOffset = 0;

    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('filter-close-btn')?.addEventListener('click', () => this.close());
    document.getElementById('filter-apply-btn')?.addEventListener('click', () => this.close());
    document.getElementById('filter-reset-btn')?.addEventListener('click', () => this.reset());

    document.getElementById('diff-all-btn')?.addEventListener('click', () => {
      this.filterTargetDiff = 'ALL';
      this._updateDiffUI();
      this._emitFilterChange();
    });
    document.getElementById('diff-step-minus')?.addEventListener('click', () => this.stepDifficulty(-1));
    document.getElementById('diff-step-plus')?.addEventListener('click', () => this.stepDifficulty(1));
    document.getElementById('diff-gte-btn')?.addEventListener('click', () => this.setDiffOp('GTE'));
    document.getElementById('diff-lte-btn')?.addEventListener('click', () => this.setDiffOp('LTE'));

    document.getElementById('filter-tags-wrap')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      const tag = btn.getAttribute('data-tag');
      if (!tag) return;
      if (this.selectedFilterTags.has(tag)) {
        this.selectedFilterTags.delete(tag);
      } else {
        this.selectedFilterTags.add(tag);
        Analytics.track('filter_tag', { filterTag: tag });
      }
      btn.classList.toggle('active', this.selectedFilterTags.has(tag));
      this._emitFilterChange();
    });

    document.getElementById('exclude-played-list')?.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      const title = cb.getAttribute('data-title');
      if (!title) return;
      if (cb.checked) this.excludedTitles.add(title);
      else this.excludedTitles.delete(title);
      this._updateActiveDot();
      if (this.onExcludeChange) this.onExcludeChange(this.excludedTitles);
    });
  }

  setContext(shows, savedExcludedTitles = []) {
    this.shows = shows || [];
    this.excludedTitles = new Set(savedExcludedTitles || []);
    this._extractUniqueTags();
    this._updateActiveDot();
  }

  _gcd(a, b) {
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  _extractUniqueTags() {
    const tagSet = new Set();
    this.shows.forEach(s => {
      (s.tags || []).forEach(t => tagSet.add(t));
    });
    this.allExtractedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  _getEvenlyDistributedTags() {
    const total = this.allExtractedTags.length;
    if (total <= 1) return [...this.allExtractedTags];

    let step = Math.floor(total * 0.6180339887) || 1;
    while (this._gcd(step, total) !== 1) {
      step = (step + 1) % total || 1;
    }
    this.tagRotationOffset = (this.tagRotationOffset + step) % total;

    const result = [];
    for (let i = 0; i < total; i++) {
      result.push(this.allExtractedTags[(this.tagRotationOffset + i * step) % total]);
    }
    return result;
  }

  open() {
    this._renderTags();
    this._renderExcludeList();
    this._updateDiffUI();
    const dialog = document.getElementById('filter-dialog');
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  close() {
    const dialog = document.getElementById('filter-dialog');
    if (dialog && dialog.open) {
      closeTopLayer(dialog);
    }
  }

  stepDifficulty(delta) {
    if (this.filterTargetDiff === 'ALL') {
      this.filterTargetDiff = String(this.currentDiffVal);
    } else {
      this.currentDiffVal = Math.max(1, Math.min(10, this.currentDiffVal + delta));
      this.filterTargetDiff = String(this.currentDiffVal);
    }
    this._updateDiffUI();
    this._emitFilterChange();
  }

  setDiffOp(op) {
    this.filterDiffOp = op;
    if (this.filterTargetDiff === 'ALL') {
      this.filterTargetDiff = String(this.currentDiffVal);
    }
    this._updateDiffUI();
    this._emitFilterChange();
  }

  _updateDiffUI() {
    const allBtn = document.getElementById('diff-all-btn');
    const rangeControls = document.getElementById('diff-range-controls');
    const valLabel = document.getElementById('diff-val-label');
    const gteBtn = document.getElementById('diff-gte-btn');
    const lteBtn = document.getElementById('diff-lte-btn');
    const summaryEl = document.getElementById('diff-summary-text');

    const isAll = this.filterTargetDiff === 'ALL';
    if (allBtn) allBtn.classList.toggle('active', isAll);
    if (rangeControls) rangeControls.style.opacity = isAll ? '0.42' : '1';
    if (valLabel) valLabel.textContent = String(this.currentDiffVal);
    if (gteBtn) gteBtn.classList.toggle('active', this.filterDiffOp === 'GTE');
    if (lteBtn) lteBtn.classList.toggle('active', this.filterDiffOp === 'LTE');
    if (summaryEl) {
      summaryEl.textContent = isAll ? '指定なし' : `${this.currentDiffVal}${this.filterDiffOp === 'GTE' ? '以上' : '以下'}`;
    }
  }

  _renderTags() {
    const wrap = document.getElementById('filter-tags-wrap');
    if (!wrap) return;
    const tags = this._getEvenlyDistributedTags();
    if (tags.length === 0) {
      wrap.innerHTML = '<span style="font-size:11px; color:var(--fes-muted);">タグが登録されていません</span>';
      return;
    }
    wrap.innerHTML = tags.map(tag => {
      const active = this.selectedFilterTags.has(tag) ? 'active' : '';
      return `<button type="button" class="chip-btn ${active}" data-tag="${Parser.escapeHtml(tag)}">${Parser.escapeHtml(tag)}</button>`;
    }).join('');
  }

  _renderExcludeList() {
    const list = document.getElementById('exclude-played-list');
    if (!list) return;

    const seen = new Set();
    const uniqueShows = [];
    this.shows.forEach(s => {
      if (s.title && !seen.has(s.title)) {
        seen.add(s.title);
        uniqueShows.push({ title: s.title, groupName: s.groupName || '不明' });
      }
    });

    list.innerHTML = uniqueShows.map(item => {
      const checked = this.excludedTitles.has(item.title) ? 'checked' : '';
      return `
        <label class="exclude-row">
          <input type="checkbox" data-title="${Parser.escapeHtml(item.title)}" ${checked}>
          <span>${Parser.escapeHtml(item.title)}（${Parser.escapeHtml(item.groupName)}）</span>
        </label>`;
    }).join('');
  }

  isTitleExcluded(title) {
    return this.excludedTitles.has(title);
  }

  /** 難易度かタグで絞り込んでいるか（参加済みの非表示は含めない） */
  hasMatchFilter() {
    return this.filterTargetDiff !== 'ALL' || this.selectedFilterTags.size > 0;
  }

  doesShowMatchFilter(show) {
    if (this.filterTargetDiff !== 'ALL') {
      const targetNum = parseInt(this.filterTargetDiff, 10);
      const showDiffNum = show.difficulty && show.difficulty.isNumeric ? show.difficulty.value : NaN;
      if (!isNaN(showDiffNum)) {
        if (this.filterDiffOp === 'GTE' && showDiffNum < targetNum) return false;
        if (this.filterDiffOp === 'LTE' && showDiffNum > targetNum) return false;
      }
    }

    if (this.selectedFilterTags.size > 0) {
      const tags = show.tags || [];
      if (!Array.from(this.selectedFilterTags).some(t => tags.includes(t))) {
        return false;
      }
    }

    return true;
  }

  reset() {
    this.filterTargetDiff = 'ALL';
    this.currentDiffVal = 3;
    this.filterDiffOp = 'GTE';
    this.selectedFilterTags.clear();
    this.excludedTitles.clear();
    this._updateDiffUI();
    this._renderTags();
    this._renderExcludeList();
    this._updateActiveDot();
    if (this.onExcludeChange) this.onExcludeChange(this.excludedTitles);
    if (this.onFilterChange) this.onFilterChange();
  }

  _updateActiveDot() {
    const hasActive =
      this.filterTargetDiff !== 'ALL' ||
      this.selectedFilterTags.size > 0 ||
      this.excludedTitles.size > 0;
    document.getElementById('tools-open-btn')?.classList.toggle('has-active', hasActive);
  }

  _emitFilterChange() {
    this._updateActiveDot();
    if (this.onFilterChange) this.onFilterChange();
  }
}
