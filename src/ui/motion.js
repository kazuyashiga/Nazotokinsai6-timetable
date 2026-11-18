/**
 * 軽量モーション＆View Transitions / Top-Layer 制御ヘルパー
 */

const SUPPORTS_ALLOW_DISCRETE =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('transition-behavior', 'allow-discrete');

/**
 * Top-Layer (<dialog> または [popover]) を退場アニメーション付きで安全に閉じる
 * allow-discrete 対応環境ではネイティブ遷移を信頼して即座に close/hidePopover を呼ぶ
 */
export async function closeTopLayer(el) {
  if (!el) return;
  const isDialog = el.tagName === 'DIALOG';
  const isOpen = isDialog ? el.open : el.matches(':popover-open');
  if (!isOpen) return;

  const performClose = () => {
    if (isDialog) {
      if (el.open) el.close();
    } else if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
      el.hidePopover();
    }
  };

  if (SUPPORTS_ALLOW_DISCRETE) {
    performClose();
    return;
  }

  el.dataset.closing = '';
  const animations = typeof el.getAnimations === 'function'
    ? el.getAnimations({ subtree: true })
    : [];
  await Promise.allSettled(animations.map(a => a.finished));
  delete el.dataset.closing;
  performClose();
}

function focusQuietly(focusSelector) {
  if (!focusSelector) return;
  const target = document.querySelector(focusSelector);
  if (target && typeof target.focus === 'function') {
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      // 一部古い環境向けフォールバック
      target.focus();
    }
  }
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * tokens.css のイージング（linear() 等）の実値を読む。Web Animations は CSS 変数を解決しないため。
 */
function readEasing(tokenName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  return value || fallback;
}

/**
 * Web Animations を実行。linear() 非対応環境ではフォールバックのイージングで再試行する
 */
function animateSafely(el, keyframes, options, fallbackEasing) {
  try {
    return el.animate(keyframes, options);
  } catch (_) {
    return el.animate(keyframes, { ...options, easing: fallbackEasing });
  }
}

/**
 * 方向付き Same-Document View Transition（DAY 切替用）を実行し、完了後にフォーカスを適切へ移動する。
 * タイムテーブルへの遷移名（timetable-stage）は、この遷移の間だけ html[data-vt="directional"] で付与する。
 * 常時付けておくと、モーダル等の top layer より手前に表が描かれてしまうため。
 * @param {'forward'|'backward'} direction
 * @param {() => void} updateFn
 * @param {string} [focusSelector]
 */
export async function runDirectionalTransition(direction, updateFn, focusSelector) {
  const root = document.documentElement;
  if (typeof document.startViewTransition !== 'function' || root.dataset.vt) {
    updateFn();
    focusQuietly(focusSelector);
    return;
  }

  root.dataset.vt = 'directional';
  let transition = null;
  try {
    transition = document.startViewTransition({
      update: updateFn,
      types: [direction === 'backward' ? 'backward' : 'forward']
    });
  } catch (_) {
    // types オプション非対応ブラウザ向けフォールバック
    try {
      transition = document.startViewTransition(updateFn);
    } catch (__) {
      delete root.dataset.vt;
      updateFn();
      focusQuietly(focusSelector);
      return;
    }
  }

  transition.finished.finally(() => {
    if (root.dataset.vt === 'directional') delete root.dataset.vt;
  });

  if (transition.updateCallbackDone) {
    try {
      await transition.updateCallbackDone;
    } catch (_) {
      // 更新内例外時は無視
    }
  }
  focusQuietly(focusSelector);
}

/**
 * モーダル内の表示切替（予定一覧 ⇔ My ハシゴテーブル）。
 * 画面を撮って重ねる View Transition は使わず、実物の白枠の高さを伸縮させ、
 * 中身を進行方向から滑り込ませる。枠・見出し・中身・下部ボタンが同じフレームで動くため、
 * 「中身だけ先に出て枠が後から来る」ずれが起きない。
 * @param {HTMLElement} card 白枠（.dialog-card）
 * @param {'forward'|'backward'} direction
 * @param {() => void} updateFn
 * @param {string} [focusSelector]
 */
export function morphDialogPanel(card, direction, updateFn, focusSelector) {
  if (!card || prefersReducedMotion() || typeof card.animate !== 'function') {
    updateFn();
    focusQuietly(focusSelector);
    return;
  }

  // 連打時：前回の切替アニメーションを終点まで進めてから測り直す
  (card._panelAnimations || []).forEach(a => a.finish());

  const startHeight = card.getBoundingClientRect().height;
  updateFn();
  focusQuietly(focusSelector);
  const endHeight = card.getBoundingClientRect().height;

  const spring = readEasing('--ease-spring-soft', 'cubic-bezier(0.24, 1, 0.4, 1)');
  const entrance = readEasing('--ease-entrance', 'cubic-bezier(0.24, 1, 0.4, 1)');
  const fallback = 'cubic-bezier(0.24, 1, 0.4, 1)';
  const sign = direction === 'backward' ? -1 : 1;
  const animations = [];

  // 1. 白枠：旧の高さ → 新の高さへ（中央寄せのダイアログなので上下に均等に伸縮する）
  if (Math.abs(endHeight - startHeight) > 0.5) {
    animations.push(animateSafely(card, [
      { height: `${startHeight}px` },
      { height: `${endHeight}px` }
    ], { duration: 380, easing: spring }, fallback));
  }

  // 2. 中身：進行方向から滑り込む（進む＝右から、戻る＝左から）
  // 位置はばねでゆっくり着地、不透明度は短く立ち上げて「空の白枠」に見える時間を作らない
  const body = card.querySelector('.dialog-body');
  if (body) {
    animations.push(animateSafely(body, [
      { transform: `translateX(${28 * sign}px)` },
      { transform: 'translateX(0)' }
    ], { duration: 360, easing: spring }, fallback));
    animations.push(body.animate([
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: 140, easing: 'ease-out' }));
  }

  // 3. 見出しと下部ボタン：中身にわずかに遅れて揃う
  const heading = card.querySelector('.dialog-head');
  if (heading) {
    animations.push(animateSafely(heading, [
      { opacity: 0, transform: `translateX(${10 * sign}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ], { duration: 240, easing: entrance, delay: 30, fill: 'backwards' }, fallback));
  }
  const footer = card.querySelector('.dialog-footer-actions:not(.hidden)');
  if (footer) {
    animations.push(animateSafely(footer, [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 300, easing: spring, delay: 60, fill: 'backwards' }, fallback));
  }

  card._panelAnimations = animations;
}
