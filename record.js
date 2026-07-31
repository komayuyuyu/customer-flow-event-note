const detailRoot = document.querySelector('#record-detail');
const navAuthButton = document.querySelector('#nav-auth-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteTargetDate = document.querySelector('#delete-target-date');
const cancelDeleteButton = document.querySelector('#cancel-delete-button');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const { FORM_OPTIONS, bindTimePlaceholders, combinedMemo, displayEventTitle, escapeHtml, readableAuthError, renderOptions, trashIcon } = window.UiUtils;
const { enrichLegacyRecord } = window.AppData;
const recordDate = new URLSearchParams(location.search).get('date') || '';
let currentRecord;

function renderDetailRow(label, content, className = '') {
  return `<div class="detail-row ${className}"><dt>${escapeHtml(label)}</dt><dd>${content || '—'}</dd></div>`;
}

function renderReadOnlyView() {
  const events = (currentRecord.relatedEvents || []).map(item => `${escapeHtml(displayEventTitle(item.title))} <span class="tag">${escapeHtml(item.status || '実施済み')}</span>`).join('<br>') || (currentRecord.eventIds?.length ? '関連イベントあり' : '通常日の記録');
  const calendarContext = (currentRecord.calendarContext || [])
    .map(item => `<span class="calendar-badge">${escapeHtml(item.type)}：${escapeHtml(item.label)}</span>`)
    .join(' ');
  detailRoot.innerHTML = `<dl class="detail-grid">
    ${renderDetailRow('記録日', escapeHtml(currentRecord.date))}
    ${renderDetailRow('集客状況', escapeHtml(currentRecord.trafficLevel))}
    ${renderDetailRow('天気', escapeHtml(currentRecord.weather))}
    ${renderDetailRow('祝日・大型連休', calendarContext)}
    ${renderDetailRow('関連イベント', events, 'detail-wide')}
    ${renderDetailRow('特に暇もしくは混雑した時間', escapeHtml((currentRecord.quietPeriods || []).join('・')))}
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

function selectedQuietPeriods() {
  return [...document.querySelectorAll('[name="period"]:checked')].map(input => input.value);
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
    quietPeriods: selectedQuietPeriods(),
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
  const periods = FORM_OPTIONS.periods.map(value => `<label class="choice"><input type="checkbox" name="period" value="${value}"${(currentRecord.quietPeriods || []).includes(value) ? ' checked' : ''}><span>${value}</span></label>`).join('');
  detailRoot.innerHTML = `<form id="detail-form">
    <p><strong>${escapeHtml(currentRecord.date)}</strong></p>
    ${events ? `<div class="related-events"><strong>関連イベント</strong>${events}</div>` : ''}
    <label class="note-label">集客状況</label>
    <select id="traffic">${renderOptions(FORM_OPTIONS.traffic, currentRecord.trafficLevel || '通常')}</select>
    <label class="note-label">天気</label>
    <select id="weather">${renderOptions(FORM_OPTIONS.weather, currentRecord.weather || '不明')}</select>
    <fieldset><legend>特に暇もしくは混雑した時間</legend><div class="choice-grid periods">${periods}</div></fieldset>
    <div class="time-grid">
      <label>影響を感じた開始時刻<span class="time-input-wrap" data-placeholder="--:--"><input id="impact-start" type="time" value="${escapeHtml(currentRecord.actualImpactStart)}"></span></label>
      <label>落ち着いた時刻<span class="time-input-wrap" data-placeholder="--:--"><input id="impact-end" type="time" value="${escapeHtml(currentRecord.actualImpactEnd)}"></span></label>
    </div>
    <label class="note-label">イベントによる影響</label>
    <select id="impact">${renderOptions(FORM_OPTIONS.eventImpact, currentRecord.eventImpact || 'わからない')}</select>
    <label class="note-label">予測結果</label>
    <select id="accuracy">${renderOptions(FORM_OPTIONS.accuracy, currentRecord.accuracy || '未判断')}</select>
    <label class="note-label">メモ</label>
    <textarea id="note" maxlength="600">${escapeHtml(combinedMemo(currentRecord))}</textarea>
    <button class="save-button" type="submit">変更を保存</button>
    <button id="cancel-button" class="action-link" type="button">キャンセル</button>
    <p id="edit-status" class="save-status"></p>
  </form>`;
  bindTimePlaceholders(detailRoot);
  document.querySelector('#cancel-button').addEventListener('click', renderReadOnlyView);
  document.querySelector('#detail-form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.querySelector('#edit-status');
    try {
      currentRecord = editedRecord();
      await RecordsBackend.save(currentRecord);
      renderReadOnlyView();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}
function openDeleteModal() { deleteTargetDate.textContent = currentRecord?.date || recordDate; deleteModal.hidden = false; }
function closeDeleteModal() { deleteModal.hidden = true; }
cancelDeleteButton.addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', event => { if (event.target === deleteModal) closeDeleteModal(); });
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
async function loadRecord(user) {
  navAuthButton.textContent = user ? 'ログアウト' : 'ログイン';
  if (!user) {
    detailRoot.innerHTML = '<p class="empty-state">記録を見るにはGoogleログインが必要です。</p>';
    return;
  }
  if (!recordDate) {
    detailRoot.innerHTML = '<p class="empty-state">記録日が指定されていません。</p>';
    return;
  }
  currentRecord = await enrichLegacyRecord(await RecordsBackend.get(recordDate));
  detailRoot.innerHTML = currentRecord ? '' : '<p class="empty-state">記録が見つかりません。</p>';
  if (currentRecord) renderReadOnlyView();
}

navAuthButton.addEventListener('click', async () => {
  try {
    if (RecordsBackend.currentUser()) await RecordsBackend.logout();
    else await RecordsBackend.login();
  } catch (error) {
    detailRoot.innerHTML = `<p class="empty-state">${escapeHtml(readableAuthError(error))}</p>`;
  }
});

RecordsBackend.initialize(loadRecord).catch(error => {
  detailRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
});
