const listRoot = document.querySelector('#records-list');
const authPanel = document.querySelector('#records-auth');
const loginButton = document.querySelector('#login-button');
const navAuthButton = document.querySelector('#nav-auth-button');
const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });
let eventMap = new Map();

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function dateLabel(value) { const date = new Date(`${value}T12:00:00`); return `${value.replaceAll('-', '/')}（${weekday.format(date)}）`; }
function eventNames(item) { return (item.relatedEvents || []).map(event => `${event.title}${event.status && event.status !== '実施済み' ? `［${event.status}］` : ''}`).join('／') || (item.eventIds || []).map(id => eventMap.get(id)?.title).filter(Boolean).join('／') || (item.eventIds?.length ? '関連イベントあり' : '通常日の記録'); }

async function render(user) {
  authPanel.hidden = Boolean(user);
  navAuthButton.textContent = user ? 'ログアウト' : 'ログイン';
  if (!user) { listRoot.innerHTML = '<p class="empty-state">ログインすると記録一覧を表示します。</p>'; return; }
  try {
    if (!eventMap.size) {
      const events = await fetch('./data/events.json', { cache: 'no-store' }).then(response => response.json()).catch(() => []);
      eventMap = new Map(events.map(event => [event.id, event]));
    }
    const records = await RecordsBackend.list();
    listRoot.innerHTML = records.length ? records.map(item => `<a class="record-list-item" href="./record.html?date=${encodeURIComponent(item.date)}"><div class="record-list-head"><strong>${escapeHtml(dateLabel(item.date))}</strong><span class="count-pill">${escapeHtml(item.trafficLevel || '未入力')}</span></div><div class="record-list-events">${escapeHtml(eventNames(item))}</div><div class="record-list-meta"><span>天気 ${escapeHtml(item.weather || '不明')}</span><span>影響 ${escapeHtml(item.eventImpact || '未記録')}</span>${(item.calendarContext || []).map(value => `<span>${escapeHtml(value.type)}：${escapeHtml(value.label)}</span>`).join('')}</div></a>`).join('') : '<p class="empty-state">保存済みの記録はありません。</p>';
  } catch (error) { listRoot.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`; }
}

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
