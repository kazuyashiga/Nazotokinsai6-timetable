import { Storage } from './Storage.js';

/**
 * 効果測定・利用レポート集計用アナリティクスクラス
 * （スプレッドシート「利用レポート」向け GAS doPost 送信 ＋ GA4 送信の両対応）
 */
export class Analytics {
  static visitorId = '';
  static eventId = 'default';
  static gasUrl = '';
  static ga4Id = '';
  static ga4Initialized = false;
  static pageViewSent = false;
  static ga4PageViewSent = false;
  static gasPageViewSent = false;
  static _syncTimer = null;
  static allShows = [];
  static showsMap = new Map();

  /**
   * 初期化・GA4 ロード・初回 page_view 送信
   */
  static init({ config = {}, eventId = 'default', fallbackGasUrl = '', allShows = [], showsMap = new Map() } = {}) {
    this.visitorId = Storage.getOrCreateVisitorId();
    this.eventId = eventId || 'default';
    this.gasUrl = config.analyticsGasUrl || fallbackGasUrl || '';
    this.ga4Id = config.ga4MeasurementId || '';
    this.allShows = allShows || [];
    this.showsMap = showsMap instanceof Map ? showsMap : new Map();

    if (this.ga4Id && /^G-[A-Z0-9]+$/i.test(this.ga4Id) && !this.ga4Initialized) {
      this._initGa4(this.ga4Id);
    }

    if (!this.pageViewSent) {
      this.pageViewSent = true;
      this.track('page_view');
    } else {
      if (this.ga4Initialized && !this.ga4PageViewSent && typeof window !== 'undefined' && typeof window.gtag === 'function') {
        this.ga4PageViewSent = true;
        try {
          window.gtag('event', 'page_view', {
            event_id: this.eventId,
            selected_count: 0,
            filter_tag: '',
            show_title: ''
          });
        } catch (_) {
          // GA4 送信失敗は無視
        }
      }
      if (this.gasUrl && this.gasUrl.startsWith('https://script.google.com/') && !this.gasPageViewSent) {
        this.gasPageViewSent = true;
        this._postToGas({
          visitorId: this.visitorId || Storage.getOrCreateVisitorId(),
          eventId: this.eventId || 'default',
          action: 'page_view',
          selectedIds: [],
          selectedTitles: [],
          selectedTags: [],
          tagCounts: {},
          filterTag: '',
          showId: '',
          showTitle: '',
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  static _initGa4(measurementId) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    this.ga4Initialized = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: false });

    const existing = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`);
    if (!existing) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    }
  }

  /**
   * ユーザーアクション・選択スナップショットを記録して送信
   */
  static track(action, extra = {}) {
    const selectedIds = Array.isArray(extra.selectedIds) ? [...extra.selectedIds] : [];
    const selectedShows = selectedIds.map(id => this.showsMap.get(id)).filter(Boolean);
    const uniqueTitles = [...new Set(selectedShows.map(s => s.title).filter(Boolean))];
    const tagCounts = {};
    selectedShows.forEach(s => {
      (s.tags || []).forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    const payload = {
      visitorId: this.visitorId || Storage.getOrCreateVisitorId(),
      eventId: this.eventId || 'default',
      action,
      selectedIds,
      selectedTitles: uniqueTitles,
      selectedTags: Object.keys(tagCounts),
      tagCounts,
      filterTag: extra.filterTag || '',
      showId: extra.showId || '',
      showTitle: extra.showTitle || '',
      timestamp: new Date().toISOString()
    };

    if (typeof window !== 'undefined') {
      window.__ANALYTICS_EVENTS__ = window.__ANALYTICS_EVENTS__ || [];
      window.__ANALYTICS_EVENTS__.push(payload);
    }

    // GA4 イベント送信
    if (typeof window !== 'undefined' && typeof window.gtag === 'function' && this.ga4Id) {
      if (action === 'page_view') {
        this.ga4PageViewSent = true;
      }
      try {
        window.gtag('event', action, {
          event_id: this.eventId,
          selected_count: selectedIds.length,
          filter_tag: payload.filterTag,
          show_title: payload.showTitle
        });
      } catch (_) {
        // GA4 送信失敗は無視
      }
    }

    // GAS Webアプリ（doPost）へのサイレント送信
    if (this.gasUrl && this.gasUrl.startsWith('https://script.google.com/')) {
      if (action === 'page_view') {
        this.gasPageViewSent = true;
      }
      this._postToGas(payload);
    }

    return payload;
  }

  static _postToGas(payload) {
    try {
      const body = JSON.stringify(payload);
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
        const queued = navigator.sendBeacon(this.gasUrl, blob);
        if (queued) return;
      }
      if (typeof fetch === 'function') {
        fetch(this.gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body,
          keepalive: true
        }).catch(() => {});
      }
    } catch (_) {
      // 効果測定通信失敗が画面操作を妨げないよう無視
    }
  }

  /**
   * 公演選択状態の変更をデバウンスして同期（連続タップによる過多送信を防止）
   */
  static schedulePlanSync(selectedIds) {
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
    }
    const snapshot = Array.isArray(selectedIds) ? [...selectedIds] : [];
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null;
      this.track('sync_plan', { selectedIds: snapshot });
    }, 1200);
  }
}
