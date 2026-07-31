const listRoot = document.querySelector('#records-list');
const paginationRoot = document.querySelector('#records-pagination');
const authPanel = document.querySelector('#records-auth');
const loginButton = document.querySelector('#login-button');
const navAuthButton = document.querySelector('#nav-auth-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteTargetDate = document.querySelector('#delete-target-date');
const cancelDeleteButton = document.querySelector('#cancel-delete-button');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const { displayEventTitle, escapeHtml, readableAuthError, trashIcon } = window.UiUtils;
const { loadEventData } = window.AppData;
const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });
let eventMap = new Map();
let activeUser = null;
let pendingDeleteDate = '';
let allRecords = [];
let currentPage = 1;
const RECORDS_PER_PAGE = 10;

function formatDateLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  return `${value.replaceAll('-', '/')}（${weekday.format(date)}）`;
}

function relatedEventLabel(item) {
  const relatedNames = (item.relatedEvents || []).map(event => {
    const title = displayEventTitle(eventMap.get(event.id)?.title || event.title);
    const status = event.status && event.status !== '実施済み' ? `［${event.status}］` : '';
    return `${title}${status}`;
  });
  if (relatedNames.length) return relatedNames.join('／');

  const legacyNames = (item.eventIds || [])
    .map(id => eventMap.get(id)?.title)
    .map(displayEventTitle)
    .filter(Boolean);
  if (legacyNames.length) return legacyNames.join('／');
  return item.eventIds?.length ? '関連イベントあり' : '通常日の記録';
}

function renderRecordCard(item) {
  const context = (item.calendarContext || [])
    .map(value => `<span>${escapeHtml(value.type)}：${escapeHtml(value.label)}</span>`)
    .join('');
  const date = escapeHtml(formatDateLabel(item.date));
  return `<article class="record-list-item">
    <a class="record-list-link" href="./record.html?date=${encodeURIComponent(item.date)}">
      <div class="record-list-head"><strong>${date}</strong><span class="count-pill">${escapeHtml(item.trafficLevel || '未入力')}</span></div>
      <div class="record-list-events">${escapeHtml(relatedEventLabel(item))}</div>
      <div class="record-list-meta"><span>天気 ${escapeHtml(item.weather || '不明')}</span><span>影響 ${escapeHtml(item.eventImpact || '未記録')}</span>${context}</div>
    </a>
    <button class="delete-icon-button" type="button" data-delete-date="${escapeHtml(item.date)}" aria-label="${date}の記録を削除">${trashIcon}</button>
  </article>`;
}

function renderPage() {
  const pageCount = Math.max(1, Math.ceil(allRecords.length / RECORDS_PER_PAGE));
  currentPage = Math.min(Math.max(currentPage, 1), pageCount);
  const start = (currentPage - 1) * RECORDS_PER_PAGE;
  listRoot.innerHTML = allRecords.length
    ? allRecords.slice(start, start + RECORDS_PER_PAGE).map(renderRecordCard).join('')
    : '<p class="empty-state">保存済みの記録はありません。</p>';
  paginationRoot.hidden = allRecords.length <= RECORDS_PER_PAGE;
  paginationRoot.innerHTML = paginationRoot.hidden ? '' : `<button type="button" data-page="${currentPage - 1}"${currentPage === 1 ? ' disabled' : ''}>前へ</button><div class="pagination-pages">${Array.from({ length: pageCount }, (_, index) => { const page = index + 1; return `<button type="button" data-page="${page}"${page === currentPage ? ' class="is-current" aria-current="page"' : ''}>${page}</button>`; }).join('')}</div><button type="button" data-page="${currentPage + 1}"${currentPage === pageCount ? ' disabled' : ''}>次へ</button>`;
  const url = new URL(location.href);
  if (currentPage === 1) url.searchParams.delete('page'); else url.searchParams.set('page', currentPage);
  history.replaceState(null, '', url);
}

async function renderRecordsPage(user) {
  activeUser = user;
  authPanel.hidden = Boolean(user);
  navAuthButton.textContent = user ? 'ログアウト' : 'ログイン';
  if (!user) {
    listRoot.innerHTML = '<p class="empty-state">ログインすると記録一覧を表示します。</p>';
    paginationRoot.hidden = true;
    return;
  }
  try {
    if (!eventMap.size) {
      const events = await loadEventData({ fallbackToEmpty: true });
      eventMap = new Map(events.map(event => [event.id, event]));
    }
    allRecords = await RecordsBackend.list();
    const requestedPage = Number.parseInt(new URLSearchParams(location.search).get('page'), 10);
    currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : currentPage;
    renderPage();
  } catch (error) {
    listRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

paginationRoot.addEventListener('click', event => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page);
  renderPage();
  document.querySelector('.page-intro').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function closeDeleteModal() { deleteModal.hidden = true; pendingDeleteDate = ''; }
listRoot.addEventListener('click', event => {
  const button = event.target.closest('[data-delete-date]');
  if (!button) return;
  pendingDeleteDate = button.dataset.deleteDate;
  deleteTargetDate.textContent = formatDateLabel(pendingDeleteDate);
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
    await renderRecordsPage(activeUser);
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
    listRoot.innerHTML = `<p class="empty-state">${escapeHtml(readableAuthError(error))}</p>`;
  }
}
loginButton.addEventListener('click', handleAuth);
navAuthButton.addEventListener('click', handleAuth);
RecordsBackend.initialize(renderRecordsPage).catch(error => { listRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`; });
