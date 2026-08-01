const detailRoot = document.querySelector('#record-detail');
const navAuthButton = document.querySelector('#nav-auth-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteTargetDate = document.querySelector('#delete-target-date');
const cancelDeleteButton = document.querySelector('#cancel-delete-button');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const {
  FORM_OPTIONS,
  bindQuietPeriodExclusivity,
  bindTimePlaceholders,
  combinedMemo,
  createAuthAction,
  createModalController,
  displayEventTitle,
  escapeHtml,
  normalizeQuietPeriods,
  readableAuthError,
  recordAuthMessage,
  renderOptions,
  selectedQuietPeriods,
  trashIcon,
} = window.UiUtils;
const { enrichLegacyRecord } = window.AppData;
const recordDate = new URLSearchParams(location.search).get('date') || '';
let currentRecord;
let saveInProgress = false;
let activeUser = null;
let recordLoadRequest = 0;

function renderDetailRow(label, content, className = '') {
  return `<div class="detail-row ${className}"><dt>${escapeHtml(label)}</dt><dd>${content || '—'}</dd></div>`;
}

function recordEventLabel(item) {
  const status = ['中止', '延期'].includes(item.status)
    ? ` <span class="record-event-status">${escapeHtml(item.status)}</span>`
    : '';
  return `${escapeHtml(displayEventTitle(item.title))}${status}`;
}

function renderReadOnlyView() {
  const events = (currentRecord.relatedEvents || []).map(recordEventLabel).join('<br>') || (currentRecord.eventIds?.length ? '関連イベントあり' : '通常日の記録');
  const calendarContext = (currentRecord.calendarContext || [])
    .map(item => `<span class="calendar-badge">${escapeHtml(item.type)}：${escapeHtml(item.label)}</span>`)
    .join(' ');
  detailRoot.innerHTML = `<dl class="detail-grid">
    ${renderDetailRow('記録日', escapeHtml(currentRecord.date))}
    ${renderDetailRow('集客状況', escapeHtml(currentRecord.trafficLevel))}
    ${renderDetailRow('天気', escapeHtml(currentRecord.weather))}
    ${renderDetailRow('祝日・大型連休', calendarContext)}
    ${renderDetailRow('関連イベント', events, 'detail-wide')}
    ${renderDetailRow('特に暇もしくは混雑した時間', escapeHtml(normalizeQuietPeriods(currentRecord.quietPeriods).join('・')))}
    ${renderDetailRow('イベントの影響', escapeHtml(currentRecord.eventImpact))}
    ${renderDetailRow('予測結果', escapeHtml(currentRecord.accuracy))}
    ${renderDetailRow('影響を感じた開始時刻', escapeHtml(currentRecord.actualImpactStart))}
    ${renderDetailRow('落ち着いた時刻', escapeHtml(currentRecord.actualImpactEnd))}
    ${renderDetailRow('メモ', escapeHtml(combinedMemo(currentRecord)), 'detail-wide')}
  </dl>
  <div class="detail-actions">
    <button id="edit-button" class="save-button" type="button">編集する</button>
    <button id="delete-record-button" class="delete-icon-button" type="button" aria-label="この記録を削除">${trashIcon}</button>
  </div>`;
  document.querySelector('#edit-button').addEventListener('click', renderEditForm);
  document.querySelector('#delete-record-button').addEventListener('click', openDeleteModal);
}

function editedRelatedEvents() {
  return (currentRecord.relatedEvents || []).map((item, index) => ({
    ...item,
    status: document.querySelector(`.event-status[data-index="${index}"]`).value,
  }));
}

function editedRecord() {
  return {
    ...currentRecord,
    relatedEvents: editedRelatedEvents(),
    trafficLevel: document.querySelector('#traffic').value,
    weather: document.querySelector('#weather').value,
    quietPeriods: selectedQuietPeriods(document.querySelector('#detail-form')),
    actualImpactStart: document.querySelector('#impact-start').value,
    actualImpactEnd: document.querySelector('#impact-end').value,
    eventImpact: document.querySelector('#impact').value,
    accuracy: document.querySelector('#accuracy').value,
    customerTopics: '',
    note: document.querySelector('#note').value,
  };
}

function renderEditForm() {
  const events = (currentRecord.relatedEvents || []).map((item, index) => `<label class="related-event-row"><span>${escapeHtml(displayEventTitle(item.title))}</span><select class="event-status" data-index="${index}">${renderOptions(FORM_OPTIONS.eventStatus, item.status || '実施済み')}</select></label>`).join('');
  const selectedPeriods = normalizeQuietPeriods(currentRecord.quietPeriods);
  const periods = FORM_OPTIONS.periods.map(value => `<label class="choice"><input type="checkbox" name="period" value="${value}"${selectedPeriods.includes(value) ? ' checked' : ''}><span>${value}</span></label>`).join('');
  detailRoot.innerHTML = `<form id="detail-form">
    <p><strong>${escapeHtml(currentRecord.date)}</strong></p>
    ${events ? `<div class="related-events"><strong>関連イベント</strong>${events}</div>` : ''}
    <label class="note-label" for="traffic">集客状況</label>
    <select id="traffic">${renderOptions(FORM_OPTIONS.traffic, currentRecord.trafficLevel || '通常')}</select>
    <label class="note-label" for="weather">天気</label>
    <select id="weather">${renderOptions(FORM_OPTIONS.weather, currentRecord.weather || '不明')}</select>
    <fieldset><legend>特に暇もしくは混雑した時間</legend><div class="choice-grid periods">${periods}</div></fieldset>
    <div class="time-grid">
      <label>影響を感じた開始時刻<span class="time-input-wrap" data-placeholder="--:--"><input id="impact-start" type="time" value="${escapeHtml(currentRecord.actualImpactStart)}"></span></label>
      <label>落ち着いた時刻<span class="time-input-wrap" data-placeholder="--:--"><input id="impact-end" type="time" value="${escapeHtml(currentRecord.actualImpactEnd)}"></span></label>
    </div>
    <label class="note-label" for="impact">イベントによる影響</label>
    <select id="impact">${renderOptions(FORM_OPTIONS.eventImpact, currentRecord.eventImpact || 'わからない')}</select>
    <label class="note-label" for="accuracy">予測結果</label>
    <select id="accuracy">${renderOptions(FORM_OPTIONS.accuracy, currentRecord.accuracy || '未判断')}</select>
    <label class="note-label" for="note">メモ</label>
    <textarea id="note" maxlength="600">${escapeHtml(combinedMemo(currentRecord))}</textarea>
    <button class="save-button" type="submit">変更を保存</button>
    <button id="cancel-button" class="action-link" type="button">キャンセル</button>
    <p id="edit-status" class="save-status"></p>
  </form>`;
  bindQuietPeriodExclusivity(document.querySelector('#detail-form'));
  bindTimePlaceholders(detailRoot);
  document.querySelector('#cancel-button').addEventListener('click', renderReadOnlyView);
  document.querySelector('#detail-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saveInProgress) return;
    const submitButton = event.submitter || event.currentTarget?.querySelector('button[type="submit"]');
    const status = document.querySelector('#edit-status');
    saveInProgress = true;
    if (submitButton) submitButton.disabled = true;
    try {
      const updatedRecord = editedRecord();
      await RecordsBackend.save(updatedRecord);
      currentRecord = updatedRecord;
      renderReadOnlyView();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    } finally {
      saveInProgress = false;
      if (submitButton) submitButton.disabled = false;
    }
  });
}
const deleteDialog = createModalController({ modal: deleteModal, initialFocus: cancelDeleteButton });
function openDeleteModal() { deleteTargetDate.textContent = currentRecord?.date || recordDate; deleteDialog.open(); }
cancelDeleteButton.addEventListener('click', deleteDialog.close);
confirmDeleteButton.addEventListener('click', async () => {
  confirmDeleteButton.disabled = true;
  try {
    await RecordsBackend.remove(currentRecord.date);
    location.href = './records.html';
  } catch (error) {
    deleteTargetDate.textContent = error.message || '削除できませんでした。';
    confirmDeleteButton.disabled = false;
  }
});
async function loadRecord(user, authError) {
  const request = ++recordLoadRequest;
  activeUser = user;
  navAuthButton.textContent = user ? 'ログアウト' : 'ログイン';
  if (!user) {
    const message = recordAuthMessage(authError, '記録を見るにはGoogleログインが必要です。');
    detailRoot.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
    return;
  }
  if (!recordDate) {
    detailRoot.innerHTML = '<p class="empty-state">記録日が指定されていません。</p>';
    return;
  }
  const storedRecord = await RecordsBackend.get(recordDate);
  if (request !== recordLoadRequest || activeUser !== user) return;
  const loadedRecord = await enrichLegacyRecord(storedRecord);
  if (request !== recordLoadRequest || activeUser !== user) return;
  currentRecord = loadedRecord;
  detailRoot.innerHTML = currentRecord ? '' : '<p class="empty-state">記録が見つかりません。</p>';
  if (currentRecord) renderReadOnlyView();
}

navAuthButton.addEventListener('click', createAuthAction({
  backend: RecordsBackend,
  onError(error) {
    detailRoot.innerHTML = `<p class="empty-state">${escapeHtml(readableAuthError(error))}</p>`;
  },
}));

RecordsBackend.initialize(loadRecord).catch(error => {
  detailRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
});
