/**
 * LocalStorage および URL 共有パラメータ (?plan=) の管理クラス
 */
export class Storage {
  static _buildKey(prefix, eventId) {
    const safeId = String(eventId || 'default').trim() || 'default';
    return `${prefix}_${safeId}`;
  }

  static getOrCreateVisitorId() {
    try {
      const existing = localStorage.getItem('visitor_id_v3');
      if (existing && existing.trim()) return existing.trim();
      const generated = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? `v3_${crypto.randomUUID()}`
        : `v3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('visitor_id_v3', generated);
      return generated;
    } catch (_) {
      return `v3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  static savePlan(eventId, selectedIds) {
    try {
      localStorage.setItem(this._buildKey('plan_v3', eventId), JSON.stringify(selectedIds));
    } catch (e) {
      console.warn('Failed to save plan to localStorage:', e);
    }
  }

  static loadPlan(eventId) {
    try {
      const raw = localStorage.getItem(this._buildKey('plan_v3', eventId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to load plan from localStorage:', e);
      return [];
    }
  }

  static saveExcludedTitles(eventId, titles) {
    try {
      localStorage.setItem(this._buildKey('excluded_v3', eventId), JSON.stringify(Array.from(titles)));
    } catch (e) {
      console.warn('Failed to save excluded titles:', e);
    }
  }

  static loadExcludedTitles(eventId) {
    try {
      const raw = localStorage.getItem(this._buildKey('excluded_v3', eventId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to load excluded titles:', e);
      return [];
    }
  }

  static saveTimetableCache(data, eventId = 'default') {
    try {
      localStorage.setItem(this._buildKey('timetable_cache_v3', eventId), JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save timetable cache:', e);
    }
  }

  static loadTimetableCache(eventId = 'default') {
    try {
      const raw = localStorage.getItem(this._buildKey('timetable_cache_v3', eventId));
      if (!raw) return null;
      const cleanJson = raw.trim().replace(/^\uFEFF/, '');
      return JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to load timetable cache:', e);
      return null;
    }
  }

  static encodeSharePlan(selectedIds, baseUrl = window.location.href) {
    const url = new URL(baseUrl);
    const cleaned = (selectedIds || []).map(id => String(id).trim()).filter(Boolean);
    if (cleaned.length > 0) {
      url.searchParams.set('plan', cleaned.join(','));
    } else {
      url.searchParams.delete('plan');
    }
    return url.toString();
  }

  static decodeSharePlan(searchStr = window.location.search) {
    const params = new URLSearchParams(searchStr);
    if (!params.has('plan')) return null;
    const raw = params.get('plan') || '';
    return raw
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }
}
