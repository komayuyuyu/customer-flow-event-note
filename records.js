const listRoot = document.querySelector('#records-list');
const authPanel = document.querySelector('#records-auth');
const loginButton = document.querySelector('#login-button');
const navAuthButton = document.querySelector('#nav-auth-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteTargetDate = document.querySelector('#delete-target-date');
const cancelDeleteButton = document.querySelector('#cancel-delete-button');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });
let eventMap = new Map();
let activeUser = null;
let pendingDeleteDate = '';
const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l.8 11.5A1.6 1.6 0 0 0 9.4 20h5.2a1.6 1.6 0 0 0 1.6-1.5L17 7M10 11v5M14 11v5"/></svg>';

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function dateLabel(value) { const date = new Date(`${value}T12:00:00`); return `${value.replaceAll('-', '/')}（${weekday.format(date)}）`; }
function eventNames(item) { return (item.relatedEvents || []).map(event => `${eventMap.get(event.id)?.title || event.title}${event.status && event.status !== '実施済み' ? `［${event.status}］` : ''}`).join('／') || (item.eventIds || []).map(id => eventMap.get(id)?.title).filter(Boolean).join('／') || (item.eventIds?.length ? '関連イベントあり' : '通常日の記録'); }

async function render(user) {
  activeUser = user;
  authPanel.hidden = Boolean(user);
  navAuthButton.textContent = user ? 'ログアウト' : 'ログイン';
  if (!user) { listRoot.innerHTML = '<p class="empty-state">ログインすると記録一覧を表示します。</p>'; return; }
  try {
    if (!eventMap.size) {
      const events = await fetch('./data/events.json', { cache: 'no-store' }).then(response => response.json()).catch(() => []);
      eventMap = new Map(events.map(event => [event.id, event]));
    }
    const records = await RecordsBackend.list();
    listRoot.innerHTML = records.length ? records.map(item => `<article class="record-list-item"><a class="record-list-link" href="./record.html?date=${encodeURIComponent(item.date)}"><div class="record-list-head"><strong>${escapeHtml(dateLabel(item.date))}</strong><span class="count-pill">${escapeHtml(item.trafficLevel || '未入力')}</span></div><div class="record-list-events">${escapeHtml(eventNames(item))}</div><div class="record-list-meta"><span>天気 ${escapeHtml(item.weather || '不明')}</span><span>影響 ${escapeHtml(item.eventImpact || '未記録')}</span>${(item.calendarContext || []).map(value => `<span>${escapeHtml(value.type)}：${escapeHtml(value.label)}</span>`).join('')}</div></a><button class="delete-icon-button" type="button" data-delete-date="${escapeHtml(item.date)}" aria-label="${escapeHtml(dateLabel(item.date))}の記録を削除">${trashIcon}</button></article>`).join('') : '<p class="empty-state">保存済みの記録はありません。</p>';
  } catch (error) { listRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`; }
}

function closeDeleteModal() { deleteModal.hidden = true; pendingDeleteDate = ''; }
listRoot.addEventListener('click', event => {
  const button = event.target.closest('[data-delete-date]');
  if (!button) return;
  pendingDeleteDate = button.dataset.deleteDate;
  deleteTargetDate.textContent = dateLabel(pendingDeleteDate);
  deleteModal.hidden = false;
});
cancelDeleteButton.addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', event => { if (event.target === deleteModal) closeDeleteModal(); });
confirmDeleteButton.addEventListener('click', async () => {
  if (!pendingDeleteDate) return;
  confirmDeleteButton.disabled = true;
  try {
    await RecordsBackend.remove(pendingDeleteDate);
    closeDeleteModal();
    await render(activeUser);
  } catch (error) {
    deleteTargetDate.textContent = error.message || '削除できませんでした。';
  } finally {
    confirmDeleteButton.disabled = false;
  }
});

async function handleAuth() {
  try {
    if (RecordsBackend.currentUser()) await RecordsBackend.logout(); else await RecordsBackend.login();
  } catch (error) {
    listRoot.innerHTML = `<p class="empty-state">${escapeHtml(error?.code === 'auth/popup-blocked' ? 'ポップアップを許可して、もう一度ログインしてください。' : 'Googleログインを完了できませんでした。')}</p>`;
  }
}
loginButton.addEventListener('click', handleAuth);
navAuthButton.addEventListener('click', handleAuth);
RecordsBackend.initialize(render).catch(error => { listRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`; });
