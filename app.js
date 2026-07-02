const FIREBASE_SDK_VERSION = '12.15.0';
const cloudConfig = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
const { escapeHtml, readableAuthError } = window.UiUtils;

const dateInput = document.querySelector('#record-date');
const datePickerButton = document.querySelector('#date-picker-button');
const calendarPopover = document.querySelector('#calendar-popover');
const calendarMonth = document.querySelector('#calendar-month');
const calendarDays = document.querySelector('#calendar-days');
const calendarPrev = document.querySelector('#calendar-prev');
const calendarNext = document.querySelector('#calendar-next');
const todayButton = document.querySelector('#today-button');
const eventsRoot = document.querySelector('#events');
const eventCount = document.querySelector('#event-count');
const weekRoot = document.querySelector('#week-schedule');
const weekCount = document.querySelector('#week-count');
const form = document.querySelector('#record-form');
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
let calendarContext;
let calendarCursor;

const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'long' });
async function loadCalendarContext() {
  if (!calendarContext) {
    calendarContext = fetch('./data/calendar-context.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : { holidays: {}, periods: [] });
  }
  return calendarContext;
}

async function contextForDate(dateText) {
  const context = await loadCalendarContext();
  const items = [];
  if (context.holidays?.[dateText]) items.push({ type: '祝日', label: context.holidays[dateText] });
  for (const period of context.periods || []) {
    if (period.start <= dateText && dateText <= period.end) items.push({ type: '大型連休', label: period.label });
  }
  return items;
}

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function checkedValue(name, fallback = '') {
  return form.querySelector(`[name="${name}"]:checked`)?.value || fallback;
}

function setChecked(name, value) {
  const target = form.querySelector(`[name="${name}"][value="${CSS.escape(value || '')}"]`);
  if (target) target.checked = true;
}

function formatWindow(window) {
  return `${window.label}：${window.start}〜${window.end}`;
}

function addDays(dateText, amount) {
  const base = new Date(`${dateText}T12:00:00`);
  base.setDate(base.getDate() + amount);
  const offset = base.getTimezoneOffset();
  return new Date(base.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function dateParts(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return { year, month, day };
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

function setCalendarOpen(open) {
  calendarPopover.hidden = !open;
  datePickerButton.setAttribute('aria-expanded', String(open));
  if (!open) return;
  const { year, month } = dateParts(dateInput.value);
  calendarCursor = new Date(year, month - 1, 1);
  renderCalendar();
}

async function selectDate(value) {
  dateInput.value = value;
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

function eventTime(event) {
  const start = event.startAt ? new Date(event.startAt) : null;
  if (!start || Number.isNaN(start.getTime())) return '時刻未定';
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
}

function eventsForDay(events, targetDate) {
  return events.filter(event => {
    const eventDate = String(event.startAt || '').slice(0, 10);
    const windowDates = new Set((event.predictedWindows || []).map(window => window.date));
    return eventDate === targetDate || windowDates.has(targetDate);
  });
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
  let eventCache;
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

  async function loadEvents() {
    if (!eventCache) {
      eventCache = fetch('./data/events.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error('イベント情報を読み込めませんでした');
        return response.json();
      });
    }
    return eventCache;
  }

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
      const events = eventsForDay(await loadEvents(), date);
      let observation = null;
      if (currentUser) {
        const reference = firestoreSdk.doc(db, 'users', currentUser.uid, 'observations', date);
        const snapshot = await firestoreSdk.getDoc(reference);
        if (snapshot.exists()) observation = snapshot.data();
      }
      return { date, events, observation };
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
  const total = days.reduce((sum, day) => sum + day.events.length, 0);
  weekCount.textContent = `${total}件`;
  weekRoot.innerHTML = days.map(day => {
    const label = shortDate(day.date);
    const dayImpact = day.events.some(event => event.impactLevel === '大') ? '大' : '中';
    const dayImpactMarkup = day.events.length
      ? `<span class="week-day-impact ${dayImpact === '大' ? 'high' : ''}">影響 ${escapeHtml(dayImpact)}</span>`
      : '';
    const contextMarkup = day.context.length
      ? day.context.map(item => `<span class="calendar-badge">${escapeHtml(item.type)}：${escapeHtml(item.label)}</span>`).join('')
      : '';
    const eventMarkup = day.events.length
      ? day.events.map(event => `<div class="week-event">
          <div class="week-event-head">
            <span class="week-impact ${event.impactLevel === '大' ? 'high' : ''}">影響 ${escapeHtml(event.impactLevel || '未判定')}</span>
            <span class="week-event-name">${escapeHtml(event.title || '名称未設定')}</span>
          </div>
          <span class="week-event-time">${escapeHtml(eventTime(event))}開始・確からしさ ${escapeHtml(event.confidence || '未判定')}</span>
        </div>`).join('')
      : '<span class="week-empty">大きな影響イベントなし</span>';
    return `<div class="week-row ${day.events.length ? 'has-events' : 'is-empty'}">
      <div class="week-date"><strong>${escapeHtml(label.date)}</strong><span>（${escapeHtml(label.weekday)}）</span></div>
      ${dayImpactMarkup}
      <div class="week-events">${contextMarkup}${eventMarkup}</div>
    </div>`;
  }).join('');
}

async function loadWeek() {
  weekCount.textContent = '確認中';
  weekRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const dates = Array.from({ length: 7 }, (_, index) => addDays(dateInput.value, index));
    const payloads = await Promise.all(dates.map(value => backend.getDay(value)));
    const contexts = await Promise.all(dates.map(contextForDate));
    renderWeek(payloads.map((payload, index) => ({ date: dates[index], events: payload.events || [], context: contexts[index] })));
  } catch (error) {
    weekCount.textContent = '取得失敗';
    weekRoot.innerHTML = '<p class="empty-state">1週間の予定を読み込めませんでした。</p>';
  }
}

function renderEvents(events, contextItems = []) {
  currentEvents = events;
  updateRecordMode(events);
  eventCount.textContent = `${events.length}件`;
  const contextMarkup = contextItems.length
    ? `<div class="calendar-context-row">${contextItems.map(item => `<span class="calendar-badge">${escapeHtml(item.type)}：${escapeHtml(item.label)}</span>`).join('')}</div>`
    : '<div class="calendar-context-row"><span class="calendar-badge muted">通常日</span></div>';
  if (!events.length) {
    eventsRoot.innerHTML = `${contextMarkup}<p class="empty-state">大きな影響イベントはありません</p>`;
    return;
  }
  eventsRoot.innerHTML = contextMarkup + events.map(event => {
    const windows = (event.predictedWindows || [])
      .filter(window => window.date === dateInput.value)
      .map(window => `<p>${escapeHtml(formatWindow(window))}<br>${escapeHtml(window.reason || '')}</p>`)
      .join('');
    return `<article class="event-card">
      <div class="event-meta">
        <span class="tag high">影響 ${escapeHtml(event.impactLevel || '未判定')}</span>
        <span class="tag">確からしさ ${escapeHtml(event.confidence || '未判定')}</span>
        ${event.broadcast ? `<span class="tag">${escapeHtml(event.broadcast)}</span>` : ''}
      </div>
      <h3>${escapeHtml(event.title || '名称未設定')}</h3>
      ${event.liveReason ? `<p>${escapeHtml(event.liveReason)}</p>` : ''}
      ${windows}
    </article>`;
  }).join('');
}

function updateRecordMode(events) {
  if (events.length) {
    recordContext.classList.add('event-linked');
    recordContext.innerHTML = '<strong>今日の注目イベントと紐づけて保存します</strong>';
    accuracyFieldset.hidden = false;
    eventImpactFieldset.hidden = false;
    renderRelatedEvents(events);
    saveButton.textContent = 'イベント日の集客記録を保存';
    return;
  }
  recordContext.classList.remove('event-linked');
  recordContext.innerHTML = '<strong>通常日の比較データとして保存します</strong>';
  accuracyFieldset.hidden = true;
  eventImpactFieldset.hidden = true;
  relatedEventsRoot.hidden = true;
  setChecked('accuracy', '未判断');
  saveButton.textContent = '通常日の集客記録を保存';
}

function renderRelatedEvents(events, savedStatuses = {}) {
  relatedEventsRoot.hidden = false;
  relatedEventsRoot.innerHTML = `<strong>関連イベント</strong>${events.map(event => {
    const status = savedStatuses[event.id] || event.status || (new Date(event.endAt || event.startAt) < new Date() ? '実施済み' : '実施予定');
    return `<label class="related-event-row"><span>${escapeHtml(event.title || '名称未設定')}</span><select name="eventStatus" data-event-id="${escapeHtml(event.id)}"><option${status === '実施予定' ? ' selected' : ''}>実施予定</option><option${status === '実施済み' ? ' selected' : ''}>実施済み</option><option${status === '中止' ? ' selected' : ''}>中止</option><option${status === '延期' ? ' selected' : ''}>延期</option></select></label>`;
  }).join('')}`;
}

function clearForm() {
  form.reset();
  document.querySelector('#impact-start').value = '';
  document.querySelector('#impact-end').value = '';
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
  document.querySelector('#impact-start').value = observation.actualImpactStart || '';
  document.querySelector('#impact-end').value = observation.actualImpactEnd || '';
  note.value = [observation.note, observation.customerTopics].filter(Boolean).join('\n');
  noteCount.textContent = `${note.value.length} / 600`;
  const statuses = Object.fromEntries((observation.relatedEvents || []).map(item => [item.id, item.status]));
  if (currentEvents.length) renderRelatedEvents(currentEvents, statuses);
}

async function loadDay() {
  saveStatus.textContent = '';
  saveStatus.classList.remove('error');
  saveActions.hidden = true;
  eventCount.textContent = '確認中';
  eventsRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const data = await backend.getDay(dateInput.value);
    const dateContext = await contextForDate(dateInput.value);
    renderEvents(data.events || [], dateContext);
    fillObservation(null);
    setRecordAccess(currentUser);
    if (checkedValue('eventImpact') === '感じなかった') {
      document.querySelector('#impact-start').disabled = true;
      document.querySelector('#impact-end').disabled = true;
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
  loadDay();
});
todayButton.addEventListener('click', () => selectDate(localToday()));
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
  if (!calendarPopover.hidden && !event.target.closest('.date-row')) setCalendarOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !calendarPopover.hidden) setCalendarOpen(false);
});
note.addEventListener('input', () => { noteCount.textContent = `${note.value.length} / 600`; });
form.addEventListener('change', event => {
  if (event.target.name !== 'eventImpact') return;
  const noImpact = event.target.value === '感じなかった';
  document.querySelector('#impact-start').disabled = noImpact;
  document.querySelector('#impact-end').disabled = noImpact;
  if (noImpact) {
    document.querySelector('#impact-start').value = '';
    document.querySelector('#impact-end').value = '';
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
    actualImpactStart: document.querySelector('#impact-start').value,
    actualImpactEnd: document.querySelector('#impact-end').value,
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
  updateDatePickerButton();
  backend = isCloudConfigured() ? await createCloudBackend() : createLocalBackend();
  await backend.initialize(async (user, errorMessage) => {
    currentUser = user;
    setRecordAccess(user, errorMessage);
    if (initialized) await loadDay();
  });
  setRecordAccess(currentUser);
  initialized = true;
  await loadDay();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=20260703-2', { updateViaCache: 'none' }).catch(() => {});
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
