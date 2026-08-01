(function () {
  const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  };

  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5.5 7l1.2 12a1.2 1.2 0 0 0 1.2 1h8.2a1.2 1.2 0 0 0 1.2-1l1.2-12M9.5 11v5M14.5 11v5"/></svg>';
  const TIME_INPUT_SELECTOR = '.time-input-wrap input[type="time"]';
  const QUIET_PERIOD_NONE = '特になし';
  const FORM_OPTIONS = {
    accuracy: ['予測どおり', '一部当たった', '外れた', '未判断'],
    eventImpact: ['感じた', '感じなかった', 'わからない', '対象外'],
    eventStatus: ['実施予定', '実施済み', '中止', '延期'],
    periods: ['午前', '昼', '夕方', '終日', '特になし'],
    traffic: ['暇', '通常', '混雑'],
    weather: ['晴れ', '曇り', '雨', '雪', '荒天', '不明'],
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => HTML_ESCAPE_MAP[character]);
  }

  function safeExternalUrl(value) {
    const candidate = String(value ?? '').trim();
    if (!candidate) return '';

    try {
      const url = new URL(candidate);
      const usesWebProtocol = url.protocol === 'https:' || url.protocol === 'http:';
      return usesWebProtocol && !url.username && !url.password ? url.href : '';
    } catch (_error) {
      return '';
    }
  }

  function readableAuthError(error) {
    if (error?.code === 'auth/popup-closed-by-user') return 'ログイン画面が閉じられました。';
    if (error?.code === 'auth/popup-blocked') return 'ログイン画面を開けませんでした。ブラウザでポップアップを許可して、もう一度お試しください。';
    if (error?.code === 'auth/unauthorized-domain') return 'このURLはGoogleログインの許可対象になっていません。';
    if (error?.code === 'auth/network-request-failed') return '認証サービスと通信できませんでした。通信状態を確認して、もう一度お試しください。';
    if (error?.code === 'auth/operation-not-allowed') return 'Googleログインが無効になっています。管理者へご連絡ください。';
    if (String(error?.code || '').startsWith('appCheck/')) return 'セキュリティ確認を完了できませんでした。ページを開き直して、もう一度お試しください。';
    return 'Googleログインを完了できませんでした。';
  }

  function recordAuthMessage(error, fallback) {
    if (!error) return fallback;
    if (error.message === 'このGoogleアカウントには記録権限がありません。') return error.message;
    return readableAuthError(error);
  }

  function createAuthAction({ backend, onError }) {
    return async function handleAuthAction() {
      try {
        if (backend.currentUser()) await backend.logout();
        else await backend.login();
      } catch (error) {
        onError(error);
      }
    };
  }

  function createModalController({ modal, initialFocus, onClose = () => {} }) {
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    let returnFocus = null;

    function open() {
      returnFocus = document.activeElement;
      modal.hidden = false;
      (initialFocus || modal.querySelector(focusableSelector))?.focus?.();
    }

    function close() {
      if (modal.hidden) return;
      modal.hidden = true;
      onClose();
      returnFocus?.focus?.();
      returnFocus = null;
    }

    modal.addEventListener('click', event => {
      if (event.target === modal) close();
    });
    modal.addEventListener('keydown', event => {
      if (modal.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll(focusableSelector)].filter(element => !element.hidden && !element.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    return { open, close };
  }

  function displayEventTitle(title, fallback = '') {
    return String(title || fallback).replace(/\b([A-Z]{3})\s*対\s*([A-Z]{3})\b/g, (_match, home, away) => {
      if (home === 'JPN' && away !== 'JPN') return `対 ${away}`;
      if (away === 'JPN' && home !== 'JPN') return `対 ${home}`;
      return `${home} 対 ${away}`;
    });
  }

  function recordMemoWithLegacyTopics(item = {}) {
    return [item.note, item.customerTopics].filter(Boolean).join('\n');
  }

  function renderOptions(values, selected) {
    return values.map(value => `<option${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
  }

  function normalizeQuietPeriods(values = []) {
    const uniqueValues = [...new Set(Array.isArray(values) ? values : [])];
    if (uniqueValues.length <= 1 || !uniqueValues.includes(QUIET_PERIOD_NONE)) return uniqueValues;
    return uniqueValues.filter(value => value !== QUIET_PERIOD_NONE);
  }

  function selectedQuietPeriods(root = document) {
    const values = [...root.querySelectorAll('[name="period"]:checked')].map(input => input.value);
    return normalizeQuietPeriods(values);
  }

  function bindQuietPeriodExclusivity(root = document) {
    root.addEventListener('change', event => {
      const target = event.target;
      if (target?.name !== 'period' || !target.checked) return;
      root.querySelectorAll('[name="period"]').forEach(input => {
        const conflictsWithSelection = target.value === QUIET_PERIOD_NONE || input.value === QUIET_PERIOD_NONE;
        if (input !== target && conflictsWithSelection) input.checked = false;
      });
    });
  }

  function syncTimePlaceholders(root = document) {
    root.querySelectorAll(TIME_INPUT_SELECTOR).forEach(input => {
      input.closest('.time-input-wrap').classList.toggle('is-empty', !input.value);
    });
  }

  function bindTimePlaceholders(root = document) {
    root.querySelectorAll(TIME_INPUT_SELECTOR).forEach(input => {
      input.addEventListener('input', () => syncTimePlaceholders(root));
      input.addEventListener('change', () => syncTimePlaceholders(root));
    });
    syncTimePlaceholders(root);
  }

  window.UiUtils = {
    FORM_OPTIONS,
    bindQuietPeriodExclusivity,
    bindTimePlaceholders,
    recordMemoWithLegacyTopics,
    createAuthAction,
    createModalController,
    displayEventTitle,
    escapeHtml,
    readableAuthError,
    recordAuthMessage,
    renderOptions,
    safeExternalUrl,
    normalizeQuietPeriods,
    selectedQuietPeriods,
    syncTimePlaceholders,
    trashIcon,
  };
}());
