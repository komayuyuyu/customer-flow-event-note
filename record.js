const root = document.querySelector('#record-detail');
const navAuthButton = document.querySelector('#nav-auth-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteTargetDate = document.querySelector('#delete-target-date');
const cancelDeleteButton = document.querySelector('#cancel-delete-button');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const { bindTimePlaceholders, displayEventTitle, escapeHtml: esc, readableAuthError, trashIcon } = window.UiUtils;
const { enrichLegacyRecord } = window.AppData;
const date = new URLSearchParams(location.search).get('date') || '';
let record;
function value(label, content, className = '') { return `<div class="detail-row ${className}"><dt>${esc(label)}</dt><dd>${content || '—'}</dd></div>`; }
function combinedMemo(item) { return [item.note, item.customerTopics].filter(Boolean).join('\n'); }
function renderView() {
  const events = (record.relatedEvents || []).map(item => `${esc(displayEventTitle(item.title))} <span class="tag">${esc(item.status || '実施済み')}</span>`).join('<br>') || (record.eventIds?.length ? '関連イベントあり' : '通常日の記録');
  root.innerHTML = `<dl class="detail-grid">${value('記録日', esc(record.date))}${value('集客状況', esc(record.trafficLevel))}${value('天気', esc(record.weather))}${value('祝日・大型連休', (record.calendarContext || []).map(item => `<span class="calendar-badge">${esc(item.type)}：${esc(item.label)}</span>`).join(' '))}${value('関連イベント', events, 'detail-wide')}${value('特に暇もしくは混雑した時間', esc((record.quietPeriods || []).join('・')))}${value('イベントの影響', esc(record.eventImpact))}${value('予測結果', esc(record.accuracy))}${value('影響を感じた開始時刻', esc(record.actualImpactStart))}${value('落ち着いた時刻', esc(record.actualImpactEnd))}${value('メモ', esc(combinedMemo(record)), 'detail-wide')}</dl><div class="detail-actions"><button id="edit-button" class="save-button" type="button">編集する</button><button id="delete-record-button" class="delete-icon-button" type="button" aria-label="この記録を削除">${trashIcon}</button></div>`;
  document.querySelector('#edit-button').addEventListener('click', renderEdit);
  document.querySelector('#delete-record-button').addEventListener('click', openDeleteModal);
}
function options(values, selected) { return values.map(value => `<option${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join(''); }

function selectedQuietPeriods() {
  return [...document.querySelectorAll('[name="period"]:checked')].map(input => input.value);
}

function editedRelatedEvents() {
  return (record.relatedEvents || []).map((item, index) => ({
    ...item,
    status: document.querySelector(`.event-status[data-index="${index}"]`).value,
  }));
}

function editedRecord() {
  return {
    ...record,
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

function renderEdit() {
  const periods = ['午前', '昼', '夕方', '終日', '特になし'];
  const events = (record.relatedEvents || []).map((item, index) => `<label class="related-event-row"><span>${esc(displayEventTitle(item.title))}</span><select class="event-status" data-index="${index}">${options(['実施予定', '実施済み', '中止', '延期'], item.status || '実施済み')}</select></label>`).join('');
  root.innerHTML = `<form id="detail-form"><p><strong>${esc(record.date)}</strong></p>${events ? `<div class="related-events"><strong>関連イベント</strong>${events}</div>` : ''}<label class="note-label">集客状況</label><select id="traffic">${options(['暇', '通常', '混雑'], record.trafficLevel || '通常')}</select><label class="note-label">天気</label><select id="weather">${options(['晴れ', '曇り', '雨', '雪', '荒天', '不明'], record.weather || '不明')}</select><fieldset><legend>特に暇もしくは混雑した時間</legend><div class="choice-grid periods">${periods.map(value => `<label class="choice"><input type="checkbox" name="period" value="${value}"${(record.quietPeriods || []).includes(value) ? ' checked' : ''}><span>${value}</span></label>`).join('')}</div></fieldset><div class="time-grid"><label>影響を感じた開始時刻<span class="time-input-wrap" data-placeholder="--:--"><input id="impact-start" type="time" value="${esc(record.actualImpactStart)}"></span></label><label>落ち着いた時刻<span class="time-input-wrap" data-placeholder="--:--"><input id="impact-end" type="time" value="${esc(record.actualImpactEnd)}"></span></label></div><label class="note-label">イベントによる影響</label><select id="impact">${options(['感じた', '感じなかった', 'わからない', '対象外'], record.eventImpact || 'わからない')}</select><label class="note-label">予測結果</label><select id="accuracy">${options(['予測どおり', '一部当たった', '外れた', '未判断'], record.accuracy || '未判断')}</select><label class="note-label">メモ</label><textarea id="note" maxlength="600">${esc(combinedMemo(record))}</textarea><button class="save-button" type="submit">変更を保存</button><button id="cancel-button" class="action-link" type="button">キャンセル</button><p id="edit-status" class="save-status"></p></form>`;
  bindTimePlaceholders(root);
  document.querySelector('#cancel-button').addEventListener('click', renderView);
  document.querySelector('#detail-form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.querySelector('#edit-status');
    try {
      record = editedRecord();
      await RecordsBackend.save(record);
      renderView();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}
function openDeleteModal() { deleteTargetDate.textContent = record?.date || date; deleteModal.hidden = false; }
function closeDeleteModal() { deleteModal.hidden = true; }
cancelDeleteButton.addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', event => { if (event.target === deleteModal) closeDeleteModal(); });
confirmDeleteButton.addEventListener('click', async () => {
  confirmDeleteButton.disabled = true;
  try {
    await RecordsBackend.remove(record.date);
    location.href = './records.html';
  } catch (error) {
    deleteTargetDate.textContent = error.message || '削除できませんでした。';
    confirmDeleteButton.disabled = false;
  }
});
async function load(user) {
  navAuthButton.textContent = user ? 'ログアウト' : 'ログイン';
  if (!user) {
    root.innerHTML = '<p class="empty-state">記録を見るにはGoogleログインが必要です。</p>';
    return;
  }
  if (!date) {
    root.innerHTML = '<p class="empty-state">記録日が指定されていません。</p>';
    return;
  }
  record = await enrichLegacyRecord(await RecordsBackend.get(date));
  root.innerHTML = record ? '' : '<p class="empty-state">記録が見つかりません。</p>';
  if (record) renderView();
}

navAuthButton.addEventListener('click', async () => {
  try {
    if (RecordsBackend.currentUser()) await RecordsBackend.logout();
    else await RecordsBackend.login();
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${esc(readableAuthError(error))}</p>`;
  }
});

RecordsBackend.initialize(load).catch(error => {
  root.innerHTML = `<p class="empty-state">${esc(error.message)}</p>`;
});
