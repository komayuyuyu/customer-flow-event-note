const root = document.querySelector('#record-detail');
const navAuthButton = document.querySelector('#nav-auth-button');
const date = new URLSearchParams(location.search).get('date') || '';
let record;
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function value(label, content) { return `<div class="detail-row"><dt>${esc(label)}</dt><dd>${content || '—'}</dd></div>`; }
function renderView() {
  const events = (record.relatedEvents || []).map(item => `${esc(item.title)} <span class="tag">${esc(item.status || '実施済み')}</span>`).join('<br>') || (record.eventIds?.length ? '関連イベントあり' : '通常日の記録');
  root.innerHTML = `<dl class="detail-grid">${value('記録日', esc(record.date))}${value('祝日・大型連休', (record.calendarContext || []).map(item => `<span class="calendar-badge">${esc(item.type)}：${esc(item.label)}</span>`).join(' '))}${value('関連イベント', events)}${value('客足', esc(record.trafficLevel))}${value('天気', esc(record.weather))}${value('特に暇だった時間', esc((record.quietPeriods || []).join('・')))}${value('イベントの影響', esc(record.eventImpact))}${value('影響を感じた開始時刻', esc(record.actualImpactStart))}${value('落ち着いた時刻', esc(record.actualImpactEnd))}${value('予測結果', esc(record.accuracy))}${value('お客様から出た話題・反応', esc(record.customerTopics))}${value('メモ', esc(record.note))}</dl><button id="edit-button" class="save-button" type="button">編集する</button>`;
  document.querySelector('#edit-button').addEventListener('click', renderEdit);
}
function options(values, selected) { return values.map(value => `<option${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join(''); }
function renderEdit() {
  const periods = ['午前', '昼', '夕方', '終日', '特になし'];
  const events = (record.relatedEvents || []).map((item, index) => `<label class="related-event-row"><span>${esc(item.title)}</span><select class="event-status" data-index="${index}">${options(['実施予定', '実施済み', '中止', '延期'], item.status || '実施済み')}</select></label>`).join('');
  root.innerHTML = `<form id="detail-form"><p><strong>${esc(record.date)}</strong></p>${events ? `<div class="related-events"><strong>関連イベント</strong>${events}</div>` : ''}<label class="note-label">客足</label><select id="traffic">${options(['暇', '通常', '混雑'], record.trafficLevel || '通常')}</select><label class="note-label">天気</label><select id="weather">${options(['晴れ', '曇り', '雨', '雪', '荒天', '不明'], record.weather || '不明')}</select><fieldset><legend>特に暇だった時間</legend><div class="choice-grid periods">${periods.map(value => `<label class="choice"><input type="checkbox" name="period" value="${value}"${(record.quietPeriods || []).includes(value) ? ' checked' : ''}><span>${value}</span></label>`).join('')}</div></fieldset><div class="time-grid"><label>影響を感じた開始時刻<input id="impact-start" type="time" value="${esc(record.actualImpactStart)}"></label><label>落ち着いた時刻<input id="impact-end" type="time" value="${esc(record.actualImpactEnd)}"></label></div><label class="note-label">イベントによる影響</label><select id="impact">${options(['感じた', '感じなかった', 'わからない', '対象外'], record.eventImpact || 'わからない')}</select><label class="note-label">予測結果</label><select id="accuracy">${options(['予測どおり', '一部当たった', '外れた', '未判断'], record.accuracy || '未判断')}</select><label class="note-label">お客様から出た話題・反応</label><textarea id="topics" maxlength="300">${esc(record.customerTopics)}</textarea><label class="note-label">メモ</label><textarea id="note" maxlength="300">${esc(record.note)}</textarea><button class="save-button" type="submit">変更を保存</button><button id="cancel-button" class="action-link" type="button">キャンセル</button><p id="edit-status" class="save-status"></p></form>`;
  document.querySelector('#cancel-button').addEventListener('click', renderView);
  document.querySelector('#detail-form').addEventListener('submit', async event => {
    event.preventDefault(); const status = document.querySelector('#edit-status');
    try {
      const relatedEvents = (record.relatedEvents || []).map((item, index) => ({ ...item, status: document.querySelector(`.event-status[data-index="${index}"]`).value }));
      record = {...record, relatedEvents, trafficLevel: document.querySelector('#traffic').value, weather: document.querySelector('#weather').value, quietPeriods: [...document.querySelectorAll('[name="period"]:checked')].map(input => input.value), actualImpactStart: document.querySelector('#impact-start').value, actualImpactEnd: document.querySelector('#impact-end').value, eventImpact: document.querySelector('#impact').value, accuracy: document.querySelector('#accuracy').value, customerTopics: document.querySelector('#topics').value, note: document.querySelector('#note').value};
      await RecordsBackend.save(record); renderView();
    } catch (error) { status.textContent = error.message; status.classList.add('error'); }
  });
}
async function enrichLegacyRecord(item) {
  if (!item) return item;
  if (!(item.relatedEvents || []).length && (item.eventIds || []).length) {
    const events = await fetch('./data/events.json', { cache: 'no-store' }).then(response => response.json()).catch(() => []);
    item.relatedEvents = events.filter(event => item.eventIds.includes(event.id)).map(event => ({ id: event.id, title: event.title, status: '実施済み' }));
  }
  if (!(item.calendarContext || []).length) {
    const context = await fetch('./data/calendar-context.json', { cache: 'no-store' }).then(response => response.json()).catch(() => ({ holidays: {}, periods: [] }));
    item.calendarContext = [];
    if (context.holidays?.[item.date]) item.calendarContext.push({ type: '祝日', label: context.holidays[item.date] });
    for (const period of context.periods || []) if (period.start <= item.date && item.date <= period.end) item.calendarContext.push({ type: '大型連休', label: period.label });
  }
  return item;
}
async function load(user) { navAuthButton.textContent = user ? 'ログアウト' : 'ログイン'; if (!user) { root.innerHTML = '<p class="empty-state">記録を見るにはGoogleログインが必要です。</p>'; return; } if (!date) { root.innerHTML = '<p class="empty-state">記録日が指定されていません。</p>'; return; } record = await enrichLegacyRecord(await RecordsBackend.get(date)); root.innerHTML = record ? '' : '<p class="empty-state">記録が見つかりません。</p>'; if (record) renderView(); }
navAuthButton.addEventListener('click', async () => { try { if (RecordsBackend.currentUser()) await RecordsBackend.logout(); else await RecordsBackend.login(); } catch (error) { root.innerHTML = `<p class="empty-state">${esc(error?.code === 'auth/popup-blocked' ? 'ポップアップを許可して、もう一度ログインしてください。' : 'Googleログインを完了できませんでした。')}</p>`; } });
RecordsBackend.initialize(load).catch(error => { root.innerHTML = `<p class="empty-state">${esc(error.message)}</p>`; });
