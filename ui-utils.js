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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => HTML_ESCAPE_MAP[character]);
  }

  function readableAuthError(error) {
    if (error?.code === 'auth/popup-closed-by-user') return 'ログイン画面が閉じられました。';
    if (error?.code === 'auth/popup-blocked') return 'ログイン画面を開けませんでした。ブラウザでポップアップを許可して、もう一度お試しください。';
    if (error?.code === 'auth/unauthorized-domain') return 'このURLはGoogleログインの許可対象になっていません。';
    return 'Googleログインを完了できませんでした。';
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

  window.UiUtils = { bindTimePlaceholders, escapeHtml, readableAuthError, syncTimePlaceholders, trashIcon };
}());
