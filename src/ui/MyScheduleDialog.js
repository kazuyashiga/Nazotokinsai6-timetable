import { Parser } from '../core/Parser.js';
import { ConflictDetector } from '../core/ConflictDetector.js';
import { Analytics } from '../core/Analytics.js';
import { closeTopLayer, morphDialogPanel } from './motion.js';

const PIN_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-7.4 7-13a7 7 0 0 0-14 0c0 5.6 7 13 7 13z"/><circle cx="12" cy="9" r="2.2"/></svg>';
/** 移動の帯のアイコン：点から点へ折れて進む経路（歩く人の絵文字は使わない） */
const ROUTE_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="5" r="2.4"/><path d="M5 8v4a3 3 0 0 0 3 3h8a3 3 0 0 1 3 3v1"/><path d="M16.5 17.5 19 20l2.5-2.5"/></svg>';
const CLOCK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

const QUIRKY_LOADING_MESSAGES = [
  'ハシゴ出来る公演を探してます…',
  'Now Solving...',
  '和同開珎解読中...',
  '感想戦中...',
  'チェックポイント待機中...',
  '開場待機中…',
  '最終解答提出中…',
  'スタッフにゴネてます…',
  'キャスト名刺待機中…',
  'お写真待機中…',
  'ラスト10分BGMについて熱く語り中…'
];

/**
 * 「自分の予定・ハシゴ表」および「My ハシゴテーブル」統合モーダル
 */
export class MyScheduleDialog {
  /**
   * @param {{ ticketView: import('./TicketView.js').TicketView, onAddShow: (id: string) => void, onRemoveShow: (id: string) => void }} deps
   */
  constructor({ ticketView, routeView, onAddShow, onRemoveShow }) {
    this.ticketView = ticketView;
    this.routeView = routeView;
    /** 会場マップ（未設定なら null。その場合、移動の帯もボタンも出さない） */
    this.venueRouter = null;
    this.onAddShow = onAddShow;
    this.onRemoveShow = onRemoveShow;

    this.config = {};
    this.allShows = [];
    this.selectedIds = [];
    this.conflictIds = new Set();
    this.duplicateIds = new Set();
    this.activeDay = 1;
    this.unlockedShows = new Set();
    this.unlockedUrls = {};
    this.isTitleExcludedFn = () => false;
    this.isMatchFn = () => true;
    this.isFilterActiveFn = () => false;

    this.mode = 'list';
    this.gapFinderActive = false;
    this.isSearchingGaps = false;
    this._msgInterval = null;
    this._searchTimer = null;

    this.dialogEl = document.getElementById('schedule-dialog');
    this._bindEvents();
  }

  _bindEvents() {
    const closeBtn = document.getElementById('schedule-close-btn');
    const backBtn = document.getElementById('schedule-back-btn');
    const findGapsBtn = document.getElementById('find-gaps-btn');
    const goPassBtn = document.getElementById('go-pass-btn');
    const timelineEl = document.getElementById('schedule-panel-timeline');
    const copyPlanBtn = document.getElementById('copy-plan-btn');
    const downloadBtn = document.getElementById('download-btn');
    const shareBtn = document.getElementById('share-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    const dialogCard = this.dialogEl?.querySelector('.dialog-card');

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        morphDialogPanel(dialogCard, 'backward', () => {
          this.mode = 'list';
          this.render();
        }, '#schedule-heading-text');
      });
    }

    if (goPassBtn) {
      goPassBtn.addEventListener('click', () => {
        Analytics.track('view_pass', { selectedIds: this.selectedIds });
        morphDialogPanel(dialogCard, 'forward', () => {
          this.mode = 'pass';
          this.render();
        }, '#schedule-heading-text');
      });
    }

    if (findGapsBtn) {
      findGapsBtn.addEventListener('click', () => {
        if (this.isSearchingGaps) return;
        if (this.gapFinderActive) {
          this.gapFinderActive = false;
          this.render();
        } else {
          this._runGapFinderWithWait();
        }
      });
    }

    if (timelineEl) {
      timelineEl.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.tl-remove-btn');
        if (removeBtn) {
          const showId = removeBtn.getAttribute('data-remove-show-id');
          if (showId && this.onRemoveShow) {
            this.onRemoveShow(showId);
          }
          return;
        }

        const routeBtn = e.target.closest('.move-strip-btn');
        if (routeBtn && this.venueRouter && this.routeView) {
          this.routeView.open(this.venueRouter, [{
            from: routeBtn.dataset.routeFrom,
            to: routeBtn.dataset.routeTo,
            nextShowLabel: routeBtn.dataset.nextLabel || ''
          }]);
          return;
        }

        const addBtn = e.target.closest('.gap-add-btn');
        if (addBtn) {
          const showId = addBtn.getAttribute('data-add-show-id');
          if (showId && this.onAddShow) {
            this.onAddShow(showId);
          }
        }
      });
    }

    const tourBtn = document.getElementById('route-tour-btn');
    if (tourBtn) {
      tourBtn.addEventListener('click', () => {
        const legs = this._routeLegs();
        if (legs.length && this.routeView) this.routeView.open(this.venueRouter, legs);
      });
    }

    if (copyPlanBtn) {
      copyPlanBtn.addEventListener('click', () => {
        this.ticketView.copyPlanTextAndUrl(this.activeDay);
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.ticketView.downloadImage(this.activeDay);
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        this.ticketView.shareImage(this.activeDay);
      });
    }

    if (this.dialogEl) {
      this.dialogEl.addEventListener('close', () => {
        this._cleanupTimers();
      });
      // closedby="any" 非対応ブラウザ向けバックドロップクリック閉じフォールバック
      this.dialogEl.addEventListener('click', (e) => {
        if (e.target === this.dialogEl) {
          this.close();
        }
      });
    }
  }

  _parseDayNum(dayVal) {
    const m = String(dayVal ?? '1').match(/\d+/);
    return m ? parseInt(m[0], 10) : 1;
  }

  /**
   * 最新状態を反映（モーダルが開いていれば即時再描画）
   */
  updateState({
    config,
    allShows,
    selectedIds,
    conflictIds,
    duplicateIds,
    activeDay,
    unlockedShows,
    unlockedUrls,
    isTitleExcludedFn,
    isMatchFn,
    isFilterActiveFn,
    venueRouter
  }) {
    if (config !== undefined) this.config = config || {};
    if (allShows !== undefined) this.allShows = allShows || [];
    if (selectedIds !== undefined) this.selectedIds = Array.isArray(selectedIds) ? selectedIds : Array.from(selectedIds || []);
    if (conflictIds !== undefined) this.conflictIds = conflictIds || new Set();
    if (duplicateIds !== undefined) this.duplicateIds = duplicateIds || new Set();
    if (activeDay !== undefined) this.activeDay = this._parseDayNum(activeDay);
    if (unlockedShows !== undefined) this.unlockedShows = unlockedShows || new Set();
    if (unlockedUrls !== undefined) this.unlockedUrls = unlockedUrls || {};
    if (isTitleExcludedFn !== undefined) this.isTitleExcludedFn = isTitleExcludedFn;
    if (isMatchFn !== undefined) this.isMatchFn = isMatchFn;
    if (isFilterActiveFn !== undefined) this.isFilterActiveFn = isFilterActiveFn;
    if (venueRouter !== undefined) this.venueRouter = venueRouter;

    if (this.dialogEl && this.dialogEl.open) {
      this.render();
    }
  }

  /**
   * 初期状態（一覧モード・スキマ未展開）でモーダルを開く
   */
  open() {
    this.mode = 'list';
    this.gapFinderActive = false;
    this._cleanupTimers();
    this.render();
    if (this.dialogEl && !this.dialogEl.open) {
      this.dialogEl.showModal();
    }
  }

  close() {
    this._cleanupTimers();
    if (this.dialogEl && this.dialogEl.open) {
      closeTopLayer(this.dialogEl);
    }
  }

  _cleanupTimers() {
    if (this._msgInterval) {
      clearInterval(this._msgInterval);
      this._msgInterval = null;
    }
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    this.isSearchingGaps = false;
    const overlay = document.getElementById('gap-loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /**
   * 最低 1250ms 以上のナゾトキあるある Now Loading を経由してからスキマ候補を展開
   */
  _runGapFinderWithWait() {
    Analytics.track('find_gaps', { selectedIds: this.selectedIds });
    const overlay = document.getElementById('gap-loading-overlay');
    const msgEl = document.getElementById('loading-quirky-msg');

    if (!overlay || !msgEl) {
      this.gapFinderActive = true;
      this.render();
      return;
    }

    this._cleanupTimers();
    this.isSearchingGaps = true;

    let idx = Math.floor(Math.random() * QUIRKY_LOADING_MESSAGES.length);
    msgEl.textContent = QUIRKY_LOADING_MESSAGES[idx];
    overlay.classList.remove('hidden');

    this._msgInterval = setInterval(() => {
      idx = (idx + 1) % QUIRKY_LOADING_MESSAGES.length;
      msgEl.textContent = QUIRKY_LOADING_MESSAGES[idx];
    }, 650);

    const waitMs = 1350;
    this._searchTimer = setTimeout(() => {
      this._cleanupTimers();
      this.gapFinderActive = true;
      this.render();
    }, waitMs);
  }

  _getDayShows() {
    return this.allShows.filter(s => this._parseDayNum(s.day) === this.activeDay);
  }

  _getSelectedDayShows() {
    const selectedSet = new Set(this.selectedIds);
    return this._getDayShows()
      .filter(s => selectedSet.has(s.id))
      .sort((a, b) => {
        const aFlex = ConflictDetector.isFlexibleShow(a) ? 1 : 0;
        const bFlex = ConflictDetector.isFlexibleShow(b) ? 1 : 0;
        if (aFlex !== bFlex) return aFlex - bFlex;
        return a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes;
      });
  }

  _resolveReserveActionHtml(show, showKeyMap) {
    const isFlexible = ConflictDetector.isFlexibleShow(show);
    if (isFlexible) {
      return '<span style="font-size:10px; font-weight:800; color:var(--fes-main);">当日現地受付</span>';
    }
    const groupKey = showKeyMap.get(show.title) || show.id;
    const isUnlocked = this.unlockedShows.has(groupKey);
    const hasLock = Boolean(show.password) && !isUnlocked;
    const rawUrl = (isUnlocked && this.unlockedUrls[groupKey]) ? this.unlockedUrls[groupKey] : show.reserveUrl;
    if (hasLock || !rawUrl) {
      return '';
    }
    return `<a href="${Parser.escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer" class="tl-reserve-btn">予約ページ</a>`;
  }

  render() {
    const backBtn = document.getElementById('schedule-back-btn');
    const headingText = document.getElementById('schedule-heading-text');
    const conflictBanner = document.getElementById('schedule-conflict-banner');
    const panelTimeline = document.getElementById('schedule-panel-timeline');
    const panelPass = document.getElementById('schedule-panel-pass');
    const footerList = document.getElementById('schedule-footer-list');
    const footerPass = document.getElementById('schedule-footer-pass');
    const findGapsBtn = document.getElementById('find-gaps-btn');
    const findGapsLabel = document.getElementById('find-gaps-label');
    const goPassBtn = document.getElementById('go-pass-btn');

    if (this.mode === 'pass') {
      if (backBtn) backBtn.classList.remove('hidden');
      if (headingText) headingText.textContent = 'My ハシゴテーブル';
      if (conflictBanner) conflictBanner.classList.add('hidden');
      document.getElementById('schedule-duplicate-banner')?.classList.add('hidden');
      if (panelTimeline) panelTimeline.classList.add('hidden');
      if (panelPass) panelPass.classList.remove('hidden');
      if (footerList) footerList.classList.add('hidden');
      if (footerPass) footerPass.classList.remove('hidden');
      const tourBtn = document.getElementById('route-tour-btn');
      if (tourBtn) tourBtn.classList.toggle('hidden', this._routeLegs().length === 0);
      this.ticketView.render(this.activeDay);
      return;
    }

    if (backBtn) backBtn.classList.add('hidden');
    if (headingText) headingText.textContent = `自分の予定・ハシゴテーブル（DAY ${this.activeDay}）`;
    if (panelTimeline) panelTimeline.classList.remove('hidden');
    if (panelPass) panelPass.classList.add('hidden');
    if (footerList) footerList.classList.remove('hidden');
    if (footerPass) footerPass.classList.add('hidden');

    const selectedDayShows = this._getSelectedDayShows();
    const dayConflicts = selectedDayShows.some(s => this.conflictIds.has(s.id));
    const dayDuplicates = selectedDayShows.some(s => this.duplicateIds.has(s.id));

    if (conflictBanner) {
      conflictBanner.classList.toggle('hidden', !dayConflicts);
    }
    document.getElementById('schedule-duplicate-banner')?.classList.toggle('hidden', !dayDuplicates);

    if (findGapsLabel) {
      findGapsLabel.textContent = this.gapFinderActive
        ? 'スキマ時間候補を閉じる'
        : 'スキマ時間に入れる公演を探す';
    }

    const timedSelected = selectedDayShows.filter(s => !ConflictDetector.isFlexibleShow(s));
    if (findGapsBtn) {
      findGapsBtn.disabled = selectedDayShows.length === 0;
      findGapsBtn.style.opacity = selectedDayShows.length === 0 ? '0.45' : '';
    }
    if (goPassBtn) {
      goPassBtn.disabled = selectedDayShows.length === 0;
      goPassBtn.style.opacity = selectedDayShows.length === 0 ? '0.45' : '';
    }

    if (!panelTimeline) return;

    if (selectedDayShows.length === 0) {
      panelTimeline.innerHTML = `
        <div class="tl-card" style="text-align:center; padding:22px 14px;">
          <p class="tl-title" style="color:var(--fes-muted); margin-bottom:4px;">選択されている公演がありません</p>
          <p style="margin:0; font-size:11px; font-weight:700; color:var(--fes-muted);">タイムテーブルの時間枠をタップするとここに追加されます。</p>
        </div>
      `;
      return;
    }

    // グループキー（演目タイトルごとの基準ID）を解決
    const dayAllShows = this._getDayShows();
    const showKeyMap = new Map();
    dayAllShows.forEach(s => {
      if (!showKeyMap.has(s.title)) showKeyMap.set(s.title, String(s.id));
    });

    // スキマ候補計算（未ロックかつ除外タイトルでないもののみ提案）
    let gapsByPrevShowId = new Map();
    if (this.gapFinderActive) {
      const selectedSet = new Set(this.selectedIds);
      const selectedTitlesSet = new Set(selectedDayShows.map(s => s.title));
      const candidatePool = dayAllShows.filter(s => {
        if (selectedTitlesSet.has(s.title)) return false;
        if (this.isTitleExcludedFn && this.isTitleExcludedFn(s.title)) return false;
        // 難易度・タグの絞り込みに合わない公演は、表と同じく候補にも出さない
        if (this.isMatchFn && !this.isMatchFn(s)) return false;
        const isNoise = s.noiseEffect === true || String(s.noiseEffect).toUpperCase() === 'TRUE';
        if (isNoise) return false;
        const gk = showKeyMap.get(s.title) || String(s.id);
        if (s.password && !this.unlockedShows.has(gk)) return false;
        return true;
      });
      gapsByPrevShowId = ConflictDetector.findGapOpportunities(
        selectedDayShows,
        candidatePool,
        selectedSet,
        Boolean(this.config.allowZeroMinTransfer)
      );
    }

    const htmlChunks = selectedDayShows.map((show, idx) => {
      const isConf = this.conflictIds.has(show.id);
      const isFlex = ConflictDetector.isFlexibleShow(show);
      const flexEndLabel = show.totalEndTime || show.acceptEndTime || '';
      const timeLabel = isFlex
        ? (flexEndLabel ? `随時受付 (${show.startTime}-${flexEndLabel})` : `随時受付 (${show.displayDuration || '時間自由'})`)
        : `${show.startTime} - ${show.endTime || Parser.minutesToTime(show.endMinutes)}`;
      const roomLabel = show.room && show.room !== '-' ? show.room : '会場未設定';
      const durationLabel = show.displayDuration || `${show.durationMin || 30}分`;
      const reserveHtml = this._resolveReserveActionHtml(show, showKeyMap);

      // 前の公演と部屋が違えば、カードの前に「移動」の帯を入れる（地図があるときだけ）
      const moveStrip = idx > 0 ? this._renderMoveStrip(selectedDayShows[idx - 1], show) : '';

      let cardAndGap = `${moveStrip}
        <div class="tl-card ${isConf ? 'is-conflict' : ''}" style="--stagger-index:${idx};">
          <div class="tl-card-top">
            <span class="tl-time-pill">${Parser.escapeHtml(timeLabel)}</span>
            <div style="display:inline-flex; align-items:center; gap:5px;">
              <span class="tl-room-badge">${PIN_SVG}<span>${Parser.escapeHtml(roomLabel)}</span></span>
              <button type="button" class="tl-remove-btn" data-remove-show-id="${Parser.escapeHtml(show.id)}" aria-label="${Parser.escapeHtml(show.title)} を予定から外す">×</button>
            </div>
          </div>
          <h3 class="tl-title">${Parser.escapeHtml(show.title)}</h3>
          <div class="tl-meta-row">
            <span>${Parser.escapeHtml(show.groupName || '出展団体')}（所要 ${Parser.escapeHtml(durationLabel)}）</span>
            ${reserveHtml}
          </div>
        </div>
      `;

      if (this.gapFinderActive && gapsByPrevShowId.has(show.id)) {
        const gap = gapsByPrevShowId.get(show.id);
        cardAndGap += this._renderGapBlock(gap);
      }

      return cardAndGap;
    });

    if (this.gapFinderActive) {
      if (timedSelected.length < 2) {
        htmlChunks.push(`
          <div class="gap-block">
            <div class="gap-header">
              <div class="gap-header-left">${CLOCK_SVG}<span>スキマ時間の判定について</span></div>
            </div>
            <div class="gap-cand-meta">時間枠指定の公演を2つ以上選択すると、その合間の空き時間に入れる公演を探せます。</div>
          </div>
        `);
      } else if (gapsByPrevShowId.size === 0) {
        htmlChunks.push(`
          <div class="gap-block">
            <div class="gap-header">
              <div class="gap-header-left">${CLOCK_SVG}<span>30分以上のスキマ時間はありませんでした</span></div>
            </div>
            <div class="gap-cand-meta">選択中の公演同士の間隔が短いため、追加で挟める空き時間帯が見つかりませんでした。</div>
          </div>
        `);
      }
    }

    panelTimeline.innerHTML = htmlChunks.join('');
  }

  /** その日の予定の順に、部屋が変わる所を移動として並べる（全行程の再生用） */
  _routeLegs() {
    if (!this.venueRouter) return [];
    const shows = this._getSelectedDayShows();
    const legs = [];
    for (let i = 1; i < shows.length; i++) {
      const a = shows[i - 1];
      const b = shows[i];
      if (this.venueRouter.route(a.room, b.room)) {
        legs.push({ from: a.room, to: b.room, nextShowLabel: this._showLabel(b) });
      }
    }
    return legs;
  }

  _showLabel(show) {
    return ConflictDetector.isFlexibleShow(show) ? `随時 ${show.title}` : `${show.startTime} ${show.title}`;
  }

  /** 移動の帯（判定は出さない。出すのは「どこからどこへ」「ルートを見る」と、建物の外を通るときの目安の徒歩の時間） */
  _renderMoveStrip(prev, next) {
    const router = this.venueRouter;
    if (!router || !prev || !next) return '';
    const route = router.route(prev.room, next.room);
    if (!route) return '';
    // 周辺地図（屋外）の上の部屋（別館など）には階の名前を付けない
    const floorOf = (seg) => (router.floors.length > 1 && !seg.floor.outdoor ? `<span class="move-floor">${Parser.escapeHtml(seg.floor.label)}</span>` : '');
    const first = route.segments[0];
    const last = route.segments[route.segments.length - 1];
    // 建物の外へ出るなら、その出入口（「正面入口から外へ」）。外から入るだけなら入る所。屋内だけなら最初の階段
    const exits = route.segments.map((s) => s.exitVia).filter(Boolean);
    const outExit = exits.find((v) => v.kind === 'entrance' && v.toFloor.outdoor);
    const inExit = exits.find((v) => v.kind === 'entrance' && !v.toFloor.outdoor);
    let via = '';
    // エレベーターで降りて 1 階の出入口から出るときは、出入口の名前（through）を書く
    if (outExit) via = `（${Parser.escapeHtml(outExit.through || outExit.name)}から外へ）`;
    else if (inExit) via = `（${Parser.escapeHtml(inExit.name)}から）`;
    else if (exits.length) via = `（${Parser.escapeHtml(exits[0].name)}経由）`;
    const walk = route.walk ? `<span class="move-walk">徒歩約${route.walk.minutes}分</span>` : '';
    return `
      <div class="move-strip" role="group" aria-label="${Parser.escapeHtml(route.from)}から${Parser.escapeHtml(route.to)}への移動">
        <span class="move-strip-icon">${ROUTE_SVG}</span>
        <span class="move-strip-text">${floorOf(first)}<b>${Parser.escapeHtml(route.from)}</b> から ${floorOf(last)}<b>${Parser.escapeHtml(route.to)}</b> へ${via}${walk}</span>
        <button type="button" class="move-strip-btn"
          data-route-from="${Parser.escapeHtml(prev.room)}"
          data-route-to="${Parser.escapeHtml(next.room)}"
          data-next-label="${Parser.escapeHtml(this._showLabel(next))}">ルートを見る</button>
      </div>`;
  }

  _renderGapBlock(gap) {
    const bufferNote = this.config.allowZeroMinTransfer ? '移動0分可' : '前後5分余裕あり';
    const candsHtml = gap.candidates.length > 0
      ? `<div class="gap-cand-list">
          ${gap.candidates.map((c, candIdx) => {
            const isFlex = ConflictDetector.isFlexibleShow(c);
            const flexRange = c.acceptEndTime || c.totalEndTime ? `${c.startTime}-${c.acceptEndTime || c.totalEndTime} / ` : '';
            const cTime = isFlex ? `随時 (${flexRange}${c.displayDuration || '約30分'})` : `${c.startTime}-${c.endTime}`;
            const cRoom = c.room && c.room !== '-' ? c.room : '会場未設定';
            return `
              <div class="gap-cand-item" style="--stagger-index:${candIdx};">
                <div class="gap-cand-main">
                  <div class="gap-cand-title">${Parser.escapeHtml(c.title)}</div>
                  <div class="gap-cand-meta">${Parser.escapeHtml(cTime)} / ${Parser.escapeHtml(cRoom)} / ${Parser.escapeHtml(c.groupName || '')}</div>
                </div>
                <button type="button" class="gap-add-btn" data-add-show-id="${Parser.escapeHtml(c.id)}">＋ 追加</button>
              </div>
            `;
          }).join('')}
        </div>`
      : '<div class="gap-cand-meta">この空き時間に入れられる公演はありませんでした。</div>';
    // 候補が減った理由が分かるよう、絞り込み中だけ一言添える
    const filterNoteHtml = this.isFilterActiveFn && this.isFilterActiveFn()
      ? '<div class="gap-cand-meta">絞り込みに合う公演だけを候補にしています</div>'
      : '';

    return `
      <div class="gap-block">
        <div class="gap-header">
          <div class="gap-header-left">
            ${CLOCK_SVG}
            <span>スキマ ${gap.gapMin}分（${Parser.escapeHtml(gap.startStr)} - ${Parser.escapeHtml(gap.endStr)} / ${bufferNote}）</span>
          </div>
          <span class="gap-count-badge">${gap.candidates.length}件</span>
        </div>
        ${filterNoteHtml}
        ${candsHtml}
      </div>
    `;
  }
}
