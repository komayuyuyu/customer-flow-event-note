const FIREBASE_SDK_VERSION = '12.15.0';
const cloudConfig = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
const { bindTimePlaceholders, combinedMemo, displayEventTitle, escapeHtml, readableAuthError, syncTimePlaceholders } = window.UiUtils;
const { addDays, contextForDate, dateParts, eventsForDate, eventsForDay, isRecordLinkedEvent, localToday } = window.AppData;

const dateInput = document.querySelector('#record-date');
const datePickerButton = document.querySelector('#date-picker-button');
const calendarPopover = document.querySelector('#calendar-popover');
const calendarMonth = document.querySelector('#calendar-month');
const calendarDays = document.querySelector('#calendar-days');
const calendarPrev = document.querySelector('#calendar-prev');
const calendarNext = document.querySelector('#calendar-next');
const calendarToday = document.querySelector('#calendar-today');
const eventTitleHeading = document.querySelector('#event-title');
const eventsRoot = document.querySelector('#events');
const eventCount = document.querySelector('#event-count');
const weekRoot = document.querySelector('#week-schedule');
const weekCount = document.querySelector('#week-count');
const weekLabel = document.querySelector('#week-label');
const weekPrev = document.querySelector('#week-prev');
const weekNext = document.querySelector('#week-next');
const form = document.querySelector('#record-form');
const impactStartInput = document.querySelector('#impact-start');
const impactEndInput = document.querySelector('#impact-end');
const note = document.querySelector('#note');
const noteCount = document.querySelector('#note-count');
const saveStatus = document.querySelector('#save-status');
const recordContext = document.querySelector('#record-context');
const accuracyFieldset = document.querySelector('#accuracy-fieldset');
const saveButton = document.querySelector('#save-button');
const authPanel = document.querySelector('#auth-panel');
const authTitle = document.querySelector('#auth-title');
const authMessage = document.querySelector('#auth-message');
const loginButton = document.querySelector('#login-button');
const logoutButton = document.querySelector('#logout-button');
const navAuthButton = document.querySelector('#nav-auth-button');
const relatedEventsRoot = document.querySelector('#related-events');
const eventImpactFieldset = document.querySelector('#event-impact-fieldset');
const saveActions = document.querySelector('#save-actions');
const detailLink = document.querySelector('#detail-link');
const continueButton = document.querySelector('#continue-button');

let backend;
let currentEvents = [];
let currentUser = null;
let initialized = false;
let calendarCursor;
let displayedWeekStart = '';

const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'long' });
const MAX_WEEK_OFFSET = 9;
const EMPTY_EVENT_TEXT = 'イベントなし';
const EMPTY_WEEK_EVENT_TEXT = '影響イベントなし';
const DEFAULT_EVENT_TITLE = '名称未設定';
const DEFAULT_EVENT_IMPACT = '未判定';
const DEFAULT_CALENDAR_LABEL = '通常日';
const CALENDAR_LABEL_ALIASES = {
  'ゴールデンウィーク': 'G.W',
  'ゴールデン・ウィーク': 'G.W',
  'シルバーウィーク': 'S.W',
  'シルバー・ウィーク': 'S.W',
  '一般的なお盆休み期間': 'お盆',
  '年末年始休み': '年末年始',
  '一般的な年末年始休み期間': '年末年始',
  '正月休み': '正月',
  'お盆休み': 'お盆',
};

function checkedValue(name, fallback = '') {
  return form.querySelector(`[name="${name}"]:checked`)?.value || fallback;
}

function setChecked(name, value) {
  const target = form.querySelector(`[name="${name}"][value="${CSS.escape(value || '')}"]`);
  if (target) target.checked = true;
}

function clearImpactTimeFields() {
  impactStartInput.value = '';
  impactEndInput.value = '';
}

function setImpactTimeFieldsDisabled(disabled) {
  impactStartInput.disabled = disabled;
  impactEndInput.disabled = disabled;
}

function setImpactTimeValues(observation = {}) {
  impactStartInput.value = observation.actualImpactStart || '';
  impactEndInput.value = observation.actualImpactEnd || '';
}

function impactTimeValues() {
  return {
    actualImpactStart: impactStartInput.value,
    actualImpactEnd: impactEndInput.value,
  };
}

function formatWindow(window) {
  return `${window.label}：${window.start}〜${window.end}`;
}

function updateDatePickerButton() {
  const { year, month, day } = dateParts(dateInput.value);
  datePickerButton.textContent = `${year}年${month}月${day}日`;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const blanks = Array.from({ length: firstWeekday }, () => '<span class="calendar-blank"></span>');
  const days = Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const selected = value === dateInput.value ? ' class="is-selected"' : '';
    return `<button type="button" data-date="${value}"${selected}>${day}</button>`;
  });
  calendarMonth.textContent = `${year}年${month + 1}月`;
  calendarDays.innerHTML = [...blanks, ...days].join('');
}

function resetCalendarPosition() {
  calendarPopover.classList.remove('is-floating');
  calendarPopover.style.removeProperty('top');
  calendarPopover.style.removeProperty('left');
}

function positionCalendarAt(anchor) {
  calendarPopover.classList.add('is-floating');
  calendarPopover.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const width = calendarPopover.offsetWidth || 320;
  const height = calendarPopover.offsetHeight || 340;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const left = Math.min(Math.max(rect.left, margin), maxLeft);
  const below = rect.bottom + gap;
  const above = rect.top - height - gap;
  const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, above);
  calendarPopover.style.left = `${left}px`;
  calendarPopover.style.top = `${top}px`;
}

function setCalendarOpen(open, anchor = null) {
  datePickerButton.setAttribute('aria-expanded', String(open));
  if (!open) {
    calendarPopover.hidden = true;
    resetCalendarPosition();
    return;
  }
  const { year, month } = dateParts(dateInput.value);
  calendarCursor = new Date(year, month - 1, 1);
  renderCalendar();
  calendarPopover.hidden = false;
  if (anchor) positionCalendarAt(anchor);
  else resetCalendarPosition();
}

async function selectDate(value) {
  dateInput.value = value;
  displayedWeekStart = startOfWeek(value);
  updateDatePickerButton();
  setCalendarOpen(false);
  await loadDay();
}

function shortDate(dateText) {
  const value = new Date(`${dateText}T12:00:00`);
  return {
    date: new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(value),
    weekday: weekday.format(value).replace('曜日', ''),
  };
}

function dottedDate(dateText) {
  const { year, month, day } = dateParts(dateText);
  return `${String(year).slice(-2)}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function eventHeadingLabel(dateText) {
  const { month, day } = dateParts(dateText);
  const label = shortDate(dateText);
  return `${month}月${day}日（${label.weekday}）`;
}

function openRecordDatePicker(anchor = null) {
  if (anchor) {
    setCalendarOpen(true, anchor);
    return;
  }
  const datePickerVisible = datePickerButton && getComputedStyle(datePickerButton).display !== 'none';
  if (datePickerVisible) {
    setCalendarOpen(true);
    return;
  }
  dateInput.scrollIntoView({ block: 'center' });
  if (typeof dateInput.showPicker === 'function') {
    dateInput.showPicker();
    return;
  }
  dateInput.focus();
  dateInput.click();
}

function updateEventHeading(dateText) {
  const label = eventHeadingLabel(dateText);
  eventTitleHeading.innerHTML = `<a class="event-title-date-button" href="#record-date" aria-label="記録日を変更">${escapeHtml(label)}</a><span>イベント</span>`;
  eventTitleHeading.querySelector('.event-title-date-button')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openRecordDatePicker(event.currentTarget);
  });
}

function startOfWeek(dateText) {
  const base = new Date(`${dateText}T12:00:00`);
  const daysFromMonday = (base.getDay() + 6) % 7;
  return addDays(dateText, -daysFromMonday);
}

function currentWeekStart() {
  return startOfWeek(localToday());
}

function weekOfYearMonday(dateText) {
  const { year } = dateParts(dateText);
  const start = new Date(`${dateText}T12:00:00`);
  const firstDay = new Date(year, 0, 1, 12);
  const firstMonday = new Date(year, 0, 1 + ((8 - firstDay.getDay()) % 7), 12);
  if (start < firstMonday) return 1;
  return Math.floor((start - firstMonday) / (7 * 24 * 60 * 60 * 1000)) + 2;
}

function weekStartDate() {
  if (!displayedWeekStart) displayedWeekStart = startOfWeek(dateInput.value);
  return displayedWeekStart;
}

async function earliestEventWeekStart() {
  const events = await window.AppData.loadEventData({ fallbackToEmpty: true });
  const dates = events.flatMap(event => [
    String(event.startAt || '').slice(0, 10),
    ...(event.predictedWindows || []).map(window => window.date),
  ]).filter(Boolean);
  if (!dates.length) return currentWeekStart();
  return startOfWeek(dates.sort()[0]);
}

async function updateWeekNav() {
  const start = weekStartDate();
  const current = currentWeekStart();
  weekLabel.textContent = start === current ? '今週' : `第${weekOfYearMonday(start)}週`;
  weekPrev.disabled = start <= await earliestEventWeekStart();
  weekNext.disabled = start >= addDays(current, MAX_WEEK_OFFSET * 7);
}

function eventTime(event) {
  const start = event.startAt ? new Date(event.startAt) : null;
  if (!start || Number.isNaN(start.getTime())) return '時刻未定';
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
}

function createLocalBackend() {
  return {
    mode: 'local',
    async initialize() {},
    async getDay(date) {
      const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error('読み込みに失敗しました');
      return response.json();
    },
    async getEvents(date) {
      return eventsForDate(date);
    },
    async saveObservation(payload) {
      const response = await fetch('./api/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '保存できませんでした');
      return result;
    },
    async listObservations() {
      const response = await fetch('./api/observations');
      if (!response.ok) throw new Error('記録一覧を読み込めませんでした');
      return response.json();
    },
  };
}

async function createCloudBackend() {
  const sdkRoot = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [{ initializeApp }, authSdk, firestoreSdk] = await Promise.all([
    import(`${sdkRoot}/firebase-app.js`),
    import(`${sdkRoot}/firebase-auth.js`),
    import(`${sdkRoot}/firebase-firestore.js`),
  ]);

  const app = initializeApp(cloudConfig.firebase);
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const provider = new authSdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let authError = '';
  let notifyUserChange = () => {};
  let initialAuthResolved = false;
  let resolveInitialAuth;
  const initialAuth = new Promise(resolve => { resolveInitialAuth = resolve; });

  await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
  authSdk.getRedirectResult(auth).catch(error => {
    authError = readableAuthError(error);
    notifyUserChange(null, authError);
  });

  authSdk.onAuthStateChanged(auth, user => {
    if (user && cloudConfig.allowedUid && user.uid !== cloudConfig.allowedUid) {
      authError = 'このGoogleアカウントには記録権限がありません。';
      authSdk.signOut(auth);
      return;
    }
    currentUser = user;
    notifyUserChange(user, authError);
    authError = '';
    if (!initialAuthResolved) {
      initialAuthResolved = true;
      resolveInitialAuth();
    }
  });

  return {
    mode: 'cloud',
    async initialize(onUserChange) {
      notifyUserChange = onUserChange;
      await initialAuth;
      onUserChange(currentUser, authError);
    },
    async login() {
      return authSdk.signInWithPopup(auth, provider);
    },
    async logout() {
      await authSdk.signOut(auth);
    },
    async getDay(date) {
      const events = eventsForDay(await window.AppData.loadEventData(), date);
      let observation = null;
      if (currentUser) {
        const reference = firestoreSdk.doc(db, 'users', currentUser.uid, 'observations', date);
        const snapshot = await firestoreSdk.getDoc(reference);
        if (snapshot.exists()) observation = snapshot.data();
      }
      return { date, events, observation };
    },
    async getEvents(date) {
      return eventsForDate(date);
    },
    async saveObservation(payload) {
      if (!currentUser) throw new Error('記録するにはGoogleログインが必要です。');
      const observation = {
        ...payload,
        ownerUid: currentUser.uid,
        updatedAt: firestoreSdk.serverTimestamp(),
      };
      const reference = firestoreSdk.doc(db, 'users', currentUser.uid, 'observations', payload.date);
      await firestoreSdk.setDoc(reference, observation, { merge: true });
      return { ok: true, observation };
    },
    async listObservations() {
      if (!currentUser) return [];
      const collection = firestoreSdk.collection(db, 'users', currentUser.uid, 'observations');
      const snapshot = await firestoreSdk.getDocs(collection);
      return snapshot.docs.map(item => item.data()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },
  };
}

function isCloudConfigured() {
  const firebase = cloudConfig.firebase || {};
  return Boolean(cloudConfig.enabled && firebase.apiKey && firebase.authDomain && firebase.projectId && firebase.appId);
}

function setRecordAccess(user, errorMessage = '') {
  const cloudMode = backend?.mode === 'cloud';
  if (!cloudMode) {
    authPanel.hidden = true;
    navAuthButton.hidden = true;
    form.classList.remove('is-locked');
    return;
  }

  const unlocked = Boolean(user);
  authPanel.hidden = unlocked;
  form.classList.toggle('is-locked', !unlocked);
  form.querySelectorAll('fieldset input, .time-grid input, textarea, select, button[type="submit"]').forEach(control => {
    control.disabled = !unlocked;
  });
  loginButton.hidden = unlocked;
  logoutButton.hidden = !unlocked;
  navAuthButton.textContent = unlocked ? 'ログアウト' : 'ログイン';

  if (unlocked) {
    authTitle.textContent = 'Googleログイン済み';
    authMessage.textContent = '勤務後記録を保存・編集できます。';
  } else {
    authTitle.textContent = '記録するにはGoogleログインが必要です';
    authMessage.textContent = errorMessage || 'イベント予定はログインなしで確認できます。';
  }
}

function renderWeek(days) {
  const total = days.reduce((sum, day) => sum + day.events.length + (day.context || []).length, 0);
  weekCount.textContent = `${total}件`;
  weekRoot.innerHTML = days.map(renderWeekDay).join('');
}

function calendarBadge(item) {
  return `<span class="calendar-badge">${escapeHtml(compactCalendarLabel(item))}</span>`;
}

function renderWeekDay(day) {
  const calendarEvents = renderWeekContextEvents(day.context);
  const hasDisplayEvents = day.events.length || calendarEvents;
  const rowClass = hasDisplayEvents ? 'has-events' : 'is-empty';
  return `<div class="week-row ${rowClass}">
    <div class="week-date"><strong>${escapeHtml(dottedDate(day.date))}</strong>${weekDayImpactBadge(day.events)}</div>
    <div class="week-events">${calendarEvents}${hasDisplayEvents ? renderWeekEvents(day.events, false) : renderWeekEvents(day.events, true)}</div>
  </div>`;
}

function weekDayImpactBadge(events) {
  if (!events.length) return '';
  const order = { '大': 3, '中': 2, '小': 1 };
  const dayImpact = events
    .map(event => event.impactLevel || '小')
    .sort((a, b) => (order[b] || 0) - (order[a] || 0))[0] || '小';
  return `<span class="week-day-impact ${dayImpact === '大' ? 'high' : ''}">影響 ${escapeHtml(dayImpact)}</span>`;
}

function renderWeekContextEvents(contextItems = []) {
  return contextItems.map(item => `<div class="week-event calendar-week-event">
    <div class="week-event-head"><span class="week-event-name">${escapeHtml(calendarContextTitle(item))}</span></div>
    <span class="week-event-time">終日・${escapeHtml(item.type || 'カレンダー')}</span>
  </div>`).join('');
}

function renderWeekEvents(events = [], showEmpty = true) {
  if (!events.length) return showEmpty ? `<span class="week-empty">${EMPTY_WEEK_EVENT_TEXT}</span>` : '';
  return events.map(renderWeekEvent).join('');
}

function eventSourceUrl(event = {}) {
  const sources = Array.isArray(event.sources) ? event.sources : [];
  const source = sources.find(item => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url.trim()));
  return source?.url.trim() || '';
}

function renderEventTitle(event = {}, fallback = DEFAULT_EVENT_TITLE) {
  const title = displayEventTitle(event.title, fallback);
  const sourceUrl = eventSourceUrl(event);
  if (!sourceUrl) return escapeHtml(title);
  const label = `${title}のWebサイトを新規タブで開く`;
  return `<a class="event-title-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}">${escapeHtml(title)}</a>`;
}

function renderWeekEvent(event) {
  return `<div class="week-event">
    <div class="week-event-head">
      <span class="week-event-name">${renderEventTitle(event)}</span>
    </div>
    <span class="week-event-time">${escapeHtml(eventTime(event))}開始${event.area ? `・${escapeHtml(event.area)}` : ''}</span>
    ${renderChampionshipCountdown(event, 'week-event-note')}
  </div>`;
}

function compactCalendarLabel(item) {
  if (!item) return DEFAULT_CALENDAR_LABEL;
  const label = item.label || item.type || DEFAULT_CALENDAR_LABEL;
  const normalized = label.replace(/\s+/g, '');
  if (normalized.includes('お盆')) return 'お盆';
  if (normalized.includes('年末年始')) return '年末年始';
  if (normalized.includes('正月')) return '正月';
  return CALENDAR_LABEL_ALIASES[normalized] || (label.length > 7 ? `${label.slice(0, 6)}…` : label);
}

function calendarContextTitle(item) {
  return compactCalendarLabel(item);
}

function calendarContextEvent(item, dateText) {
  const title = calendarContextTitle(item);
  return {
    id: `calendar-${dateText}-${item.type || 'context'}-${title}`,
    title,
    status: '実施予定',
    startAt: `${dateText}T00:00:00+09:00`,
    endAt: `${dateText}T23:59:00+09:00`,
    category: item.type || 'カレンダー',
    area: '全国',
    confidence: '高',
    impactLevel: '中',
    calendarContextEvent: true,
  };
}

function primaryCalendarContext(contextItems = []) {
  return contextItems.find(item => item.type === '大型連休') || contextItems[0] || null;
}

function calendarTitleBadge(contextItems = []) {
  const context = primaryCalendarContext(contextItems);
  const muted = context ? '' : ' muted';
  return `<span class="calendar-badge title-badge${muted}">${escapeHtml(compactCalendarLabel(context))}</span>`;
}

async function loadWeek() {
  await updateWeekNav();
  weekCount.textContent = '確認中';
  weekRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const start = weekStartDate();
    const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    const eventLists = await Promise.all(dates.map(value => backend.getEvents(value)));
    const contexts = await Promise.all(dates.map(contextForDate));
    renderWeek(dates.map((date, index) => ({ date, events: eventLists[index], context: contexts[index] })));
  } catch (error) {
    weekCount.textContent = '取得失敗';
    weekRoot.innerHTML = '<p class="empty-state">1週間の予定を読み込めませんでした。</p>';
  }
}

function renderEvents(events, contextItems = []) {
  const calendarEvents = contextItems.map(item => calendarContextEvent(item, dateInput.value));
  const displayEvents = [...calendarEvents, ...events];
  currentEvents = displayEvents.filter(isRecordLinkedEvent);
  updateRecordMode(currentEvents);
  eventCount.textContent = `${displayEvents.length}件`;
  if (!displayEvents.length) {
    eventsRoot.innerHTML = renderEmptyTodayEvent();
    return;
  }
  eventsRoot.innerHTML = [...calendarEvents.map(renderCalendarEventCard), ...events.map(renderTodayEventCard)].join('');
}

function renderEmptyTodayEvent() {
  return `<div class="empty-state event-empty-state"><div class="event-title-row event-empty-title"><span>${EMPTY_EVENT_TEXT}</span></div></div>`;
}

function renderCalendarEventCard(event) {
  return `<article class="event-card calendar-event-card">
    <div class="event-title-row"><h3>${escapeHtml(event.title || DEFAULT_EVENT_TITLE)}</h3></div>
    <div class="event-meta"><span class="tag">${escapeHtml(event.category || 'カレンダー')}</span><span class="tag">終日</span></div>
  </article>`;
}

function renderTodayEventCard(event) {
  return `<article class="event-card">
    <div class="event-title-row">
      <h3>${renderEventTitle(event)}</h3>
    </div>
    ${renderEventMeta(event)}
    ${event.liveReason ? `<p>${escapeHtml(event.liveReason)}</p>` : ''}
    ${renderChampionshipCountdown(event)}
    ${renderEventDetails(event)}
    ${renderPredictedWindows(event)}
  </article>`;
}

function renderEventMeta(event) {
  return `<div class="event-meta">
    <span class="tag high">影響 ${escapeHtml(event.impactLevel || DEFAULT_EVENT_IMPACT)}</span>
    ${event.category ? `<span class="tag">${escapeHtml(event.category)}</span>` : ''}
    ${event.area ? `<span class="tag">${escapeHtml(event.area)}</span>` : ''}
    ${renderBroadcastTags(event.broadcast)}
  </div>`;
}

function compactBroadcastLabels(broadcast = '') {
  const compactSource = broadcast.replace(/[（(].*?[）)]/g, '').replace(/有無は直前確認/g, '');
  return compactSource
    .split(/[・、,／]/)
    .map(item => item.replace(/^(海外|国内放送権対象)[:：]\s*/, '').trim())
    .filter(Boolean)
    .map(item => item.length > 10 ? `${item.slice(0, 9)}…` : item)
    .slice(0, 3);
}

function renderBroadcastTags(broadcast = '') {
  return compactBroadcastLabels(broadcast)
    .map(label => `<span class="tag">${escapeHtml(label)}</span>`)
    .join('');
}

function renderChampionshipCountdown(event, className = 'event-countdown') {
  const wins = event.championship?.winsToTitle;
  if (!wins) return '';
  return `<p class="${className}">あと${escapeHtml(wins)}勝で優勝</p>`;
}

function renderEventDetails(event) {
  const items = [];
  if (event.championship?.condition) items.push(`優勝条件：${event.championship.condition}`);
  if (event.championship?.runnerUpCondition) items.push(`逆転条件：${event.championship.runnerUpCondition}`);
  if (event.broadcast) items.push(`放送・配信：${event.broadcast}`);
  if (event.trafficReason) items.push(`客足メモ：${event.trafficReason}`);
  if (!items.length) return '';
  return `<ul class="event-detail-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderPredictedWindows(event) {
  return (event.predictedWindows || [])
    .filter(window => window.date === dateInput.value)
    .map(window => `<p>${escapeHtml(formatWindow(window))}<br>${escapeHtml(window.reason || '')}</p>`)
    .join('');
}

function updateRecordMode(events) {
  if (events.length) {
    recordContext.classList.add('event-linked');
    recordContext.innerHTML = '<strong>イベントと紐づけて保存します</strong>';
    accuracyFieldset.hidden = false;
    eventImpactFieldset.hidden = false;
    renderRelatedEvents(events);
    saveButton.textContent = '集客記録を保存';
    return;
  }
  recordContext.classList.remove('event-linked');
  recordContext.innerHTML = '<strong>通常日の比較データとして保存します</strong>';
  accuracyFieldset.hidden = true;
  eventImpactFieldset.hidden = true;
  relatedEventsRoot.hidden = true;
  setChecked('accuracy', '未判断');
  saveButton.textContent = '集客記録を保存';
}

function renderRelatedEvents(events, savedStatuses = {}) {
  relatedEventsRoot.hidden = false;
  relatedEventsRoot.innerHTML = `<strong>関連イベント</strong>${events.map(event => {
    const status = savedStatuses[event.id] || event.status || (new Date(event.endAt || event.startAt) < new Date() ? '実施済み' : '実施予定');
    return `<label class="related-event-row"><span>${escapeHtml(event.title || '名称未設定')}</span><select name="eventStatus" data-event-id="${escapeHtml(event.id)}"><option${status === '実施予定' ? ' selected' : ''}>実施予定</option><option${status === '実施済み' ? ' selected' : ''}>実施済み</option><option${status === '中止' ? ' selected' : ''}>中止</option><option${status === '延期' ? ' selected' : ''}>延期</option></select></label>`;
  }).join('')}`;
}

function clearForm() {
  const selectedDate = dateInput.value;
  form.reset();
  dateInput.value = selectedDate;
  updateDatePickerButton();
  clearImpactTimeFields();
  syncTimePlaceholders();
  note.value = '';
  noteCount.textContent = '0 / 600';
  saveActions.hidden = true;
}

function fillObservation(observation) {
  clearForm();
  if (!observation) {
    setChecked('weather', '不明');
    setChecked('accuracy', '未判断');
    return;
  }
  setChecked('traffic', observation.trafficLevel);
  setChecked('weather', observation.weather);
  setChecked('accuracy', observation.accuracy);
  setChecked('eventImpact', observation.eventImpact);
  for (const period of observation.quietPeriods || []) setChecked('period', period);
  setImpactTimeValues(observation);
  syncTimePlaceholders();
  note.value = combinedMemo(observation);
  noteCount.textContent = `${note.value.length} / 600`;
  const statuses = Object.fromEntries((observation.relatedEvents || []).map(item => [item.id, item.status]));
  if (currentEvents.length) renderRelatedEvents(currentEvents, statuses);
}

async function loadDay() {
  saveStatus.textContent = '';
  saveStatus.classList.remove('error');
  saveActions.hidden = true;
  updateEventHeading(dateInput.value);
  eventCount.textContent = '確認中';
  eventsRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const data = await backend.getDay(dateInput.value);
    const dateContext = await contextForDate(dateInput.value);
    renderEvents(data.events || [], dateContext);
    fillObservation(null);
    setRecordAccess(currentUser);
    if (checkedValue('eventImpact') === '感じなかった') {
      setImpactTimeFieldsDisabled(true);
    }
    await loadWeek();
  } catch (error) {
    eventCount.textContent = '取得失敗';
    eventsRoot.innerHTML = '<p class="empty-state">イベント情報を読み込めませんでした。</p>';
    saveStatus.classList.add('error');
    saveStatus.textContent = readableDataError(error, 'データを読み込めませんでした。');
  }
}

dateInput.addEventListener('change', () => {
  updateDatePickerButton();
  displayedWeekStart = startOfWeek(dateInput.value);
  loadDay();
});
calendarToday.addEventListener('click', () => selectDate(localToday()));
weekPrev.addEventListener('click', () => {
  if (weekPrev.disabled) return;
  displayedWeekStart = addDays(weekStartDate(), -7);
  loadWeek();
});
weekLabel.addEventListener('click', () => {
  displayedWeekStart = currentWeekStart();
  loadWeek();
});
weekNext.addEventListener('click', () => {
  if (weekNext.disabled) return;
  displayedWeekStart = addDays(weekStartDate(), 7);
  loadWeek();
});
datePickerButton.addEventListener('click', () => setCalendarOpen(calendarPopover.hidden));
calendarPrev.addEventListener('click', () => {
  calendarCursor.setMonth(calendarCursor.getMonth() - 1);
  renderCalendar();
});
calendarNext.addEventListener('click', () => {
  calendarCursor.setMonth(calendarCursor.getMonth() + 1);
  renderCalendar();
});
calendarDays.addEventListener('click', event => {
  const button = event.target.closest('[data-date]');
  if (button) selectDate(button.dataset.date);
});
document.addEventListener('click', event => {
  const calendarTarget = event.target.closest('.date-row, .calendar-popover, .event-title-date-button');
  if (!calendarPopover.hidden && !calendarTarget) setCalendarOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !calendarPopover.hidden) setCalendarOpen(false);
});
note.addEventListener('input', () => { noteCount.textContent = `${note.value.length} / 600`; });
bindTimePlaceholders();
form.addEventListener('change', event => {
  if (event.target.name !== 'eventImpact') return;
  const noImpact = event.target.value === '感じなかった';
  setImpactTimeFieldsDisabled(noImpact);
  if (noImpact) {
    clearImpactTimeFields();
    syncTimePlaceholders();
  }
});

async function requestLogin(triggerButton) {
  triggerButton.disabled = true;
  try {
    await backend.login();
  } catch (error) {
    setRecordAccess(null, readableAuthError(error));
  } finally {
    triggerButton.disabled = false;
  }
}

loginButton.addEventListener('click', () => requestLogin(loginButton));

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  await backend.logout();
  logoutButton.disabled = false;
});

navAuthButton.addEventListener('click', async () => {
  if (currentUser) return logoutButton.click();
  return requestLogin(navAuthButton);
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  saveStatus.classList.remove('error');
  saveButton.disabled = true;
  const payload = {
    date: dateInput.value,
    eventIds: currentEvents.map(item => item.id),
    relatedEvents: currentEvents.map(item => {
      const select = form.querySelector(`[data-event-id="${CSS.escape(item.id)}"]`);
      return { id: item.id, title: item.title, status: select?.value || '実施予定' };
    }),
    weather: checkedValue('weather', '不明'),
    trafficLevel: checkedValue('traffic'),
    quietPeriods: [...form.querySelectorAll('[name="period"]:checked')].map(input => input.value),
    ...impactTimeValues(),
    accuracy: checkedValue('accuracy', '未判断'),
    eventImpact: checkedValue('eventImpact', currentEvents.length ? 'わからない' : '対象外'),
    note: note.value,
    customerTopics: '',
    calendarContext: await contextForDate(dateInput.value),
  };
  try {
    await backend.saveObservation(payload);
    saveStatus.textContent = '';
    detailLink.href = `./record.html?date=${encodeURIComponent(payload.date)}`;
    fillObservation(null);
    updateRecordMode(currentEvents);
    saveActions.hidden = false;
  } catch (error) {
    saveStatus.classList.add('error');
    saveStatus.textContent = readableDataError(error, '保存できませんでした。');
  } finally {
    saveButton.disabled = false;
  }
});

continueButton.addEventListener('click', async () => {
  saveActions.hidden = true;
  await selectDate(addDays(dateInput.value, -1));
  document.querySelector('#record-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function initialize() {
  const requestedDate = new URLSearchParams(location.search).get('date');
  dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : localToday();
  displayedWeekStart = startOfWeek(dateInput.value);
  updateDatePickerButton();
  syncTimePlaceholders();
  backend = isCloudConfigured() ? await createCloudBackend() : createLocalBackend();
  await backend.initialize(async (user, errorMessage) => {
    currentUser = user;
    setRecordAccess(user, errorMessage);
    if (initialized) await loadDay();
  });
  setRecordAccess(currentUser);
  initialized = true;
  await loadDay();
  if (location.hash === '#record-form') requestAnimationFrame(() => requestAnimationFrame(() => form.scrollIntoView({ block: 'start' })));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=20260718-02', { updateViaCache: 'none' }).catch(() => {});
}

initialize().catch(error => {
  eventCount.textContent = '初期化失敗';
  eventsRoot.innerHTML = '<p class="empty-state">アプリを起動できませんでした。</p>';
  saveStatus.classList.add('error');
  saveStatus.textContent = error.message || 'アプリを起動できませんでした。';
});

function readableDataError(error, fallback) {
  const message = String(error?.message || '');
  if (message.includes('Missing or insufficient permissions')) return '記録の読み込み権限を確認できませんでした。いったんログアウトして、もう一度ログインしてください。';
  if (message.includes('network') || message.includes('offline')) return '通信できませんでした。接続を確認して、もう一度お試しください。';
  return message || fallback;
}
