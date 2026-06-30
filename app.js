const FIREBASE_SDK_VERSION = '12.15.0';
const cloudConfig = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };

const dateInput = document.querySelector('#record-date');
const dayLabel = document.querySelector('#day-label');
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

let backend;
let currentEvents = [];
let currentUser = null;
let initialized = false;

const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'long' });
const fullDate = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' });

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

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
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
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (mobile) return authSdk.signInWithRedirect(auth, provider);
      try {
        return await authSdk.signInWithPopup(auth, provider);
      } catch (error) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
          return authSdk.signInWithRedirect(auth, provider);
        }
        throw error;
      }
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
  };
}

function readableAuthError(error) {
  if (error?.code === 'auth/popup-closed-by-user') return 'ログイン画面が閉じられました。';
  if (error?.code === 'auth/unauthorized-domain') return 'このURLはGoogleログインの許可対象になっていません。';
  return 'Googleログインを完了できませんでした。';
}

function isCloudConfigured() {
  const firebase = cloudConfig.firebase || {};
  return Boolean(cloudConfig.enabled && firebase.apiKey && firebase.authDomain && firebase.projectId && firebase.appId);
}

function setRecordAccess(user, errorMessage = '') {
  const cloudMode = backend?.mode === 'cloud';
  authPanel.hidden = !cloudMode;
  if (!cloudMode) {
    form.classList.remove('is-locked');
    return;
  }

  const unlocked = Boolean(user);
  form.classList.toggle('is-locked', !unlocked);
  form.querySelectorAll('fieldset input, .time-grid input, textarea, button[type="submit"]').forEach(control => {
    control.disabled = !unlocked;
  });
  loginButton.hidden = unlocked;
  logoutButton.hidden = !unlocked;

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
  weekCount.textContent = total ? `${total}件` : '大きな影響なし';
  weekRoot.innerHTML = days.map(day => {
    const label = shortDate(day.date);
    const dayImpact = day.events.some(event => event.impactLevel === '大') ? '大' : '中';
    const dayImpactMarkup = day.events.length
      ? `<span class="week-day-impact ${dayImpact === '大' ? 'high' : ''}">影響 ${escapeHtml(dayImpact)}</span>`
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
      <div class="week-events">${eventMarkup}</div>
    </div>`;
  }).join('');
}

async function loadWeek() {
  weekCount.textContent = '確認中';
  weekRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const dates = Array.from({ length: 7 }, (_, index) => addDays(dateInput.value, index));
    const payloads = await Promise.all(dates.map(value => backend.getDay(value)));
    renderWeek(payloads.map((payload, index) => ({ date: dates[index], events: payload.events || [] })));
  } catch (error) {
    weekCount.textContent = '取得失敗';
    weekRoot.innerHTML = '<p class="empty-state">1週間の予定を読み込めませんでした。</p>';
  }
}

function renderEvents(events) {
  currentEvents = events;
  updateRecordMode(events);
  eventCount.textContent = events.length ? `${events.length}件` : '大きな影響なし';
  if (!events.length) {
    eventsRoot.innerHTML = '<p class="empty-state">現在、登録されている大きな影響イベントはありません。</p>';
    return;
  }
  eventsRoot.innerHTML = events.map(event => {
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
    recordContext.innerHTML = `<strong>今日の注目イベントと紐づけて保存します</strong>${escapeHtml(events.length)}件のイベントについて、事前予測と実際の客足を比較できます。`;
    accuracyFieldset.hidden = false;
    saveButton.textContent = 'イベントの影響記録を保存';
    return;
  }
  recordContext.classList.remove('event-linked');
  recordContext.innerHTML = '<strong>通常日の比較データとして保存します</strong>注目イベントがない日の客足も、イベント日の影響を比べる基準になります。';
  accuracyFieldset.hidden = true;
  setChecked('accuracy', '未判断');
  saveButton.textContent = '通常日の客足を保存';
}

function clearForm() {
  form.reset();
  document.querySelector('#impact-start').value = '';
  document.querySelector('#impact-end').value = '';
  note.value = '';
  noteCount.textContent = '0 / 300';
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
  for (const period of observation.quietPeriods || []) setChecked('period', period);
  document.querySelector('#impact-start').value = observation.actualImpactStart || '';
  document.querySelector('#impact-end').value = observation.actualImpactEnd || '';
  note.value = observation.note || '';
  noteCount.textContent = `${note.value.length} / 300`;
}

async function loadDay() {
  saveStatus.textContent = '';
  const selected = new Date(`${dateInput.value}T12:00:00`);
  dayLabel.textContent = `${fullDate.format(selected)}（${weekday.format(selected)}）`;
  eventCount.textContent = '確認中';
  eventsRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const data = await backend.getDay(dateInput.value);
    renderEvents(data.events || []);
    fillObservation(data.observation);
    setRecordAccess(currentUser);
    await loadWeek();
  } catch (error) {
    eventCount.textContent = '取得失敗';
    eventsRoot.innerHTML = '<p class="empty-state">イベント情報を読み込めませんでした。</p>';
    saveStatus.classList.add('error');
    saveStatus.textContent = error.message || 'データを読み込めませんでした。';
  }
}

dateInput.addEventListener('change', loadDay);
note.addEventListener('input', () => { noteCount.textContent = `${note.value.length} / 300`; });

loginButton.addEventListener('click', async () => {
  loginButton.disabled = true;
  try {
    await backend.login();
  } catch (error) {
    setRecordAccess(null, readableAuthError(error));
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  await backend.logout();
  logoutButton.disabled = false;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  saveStatus.classList.remove('error');
  saveButton.disabled = true;
  const payload = {
    date: dateInput.value,
    eventIds: currentEvents.map(item => item.id),
    weather: checkedValue('weather', '不明'),
    trafficLevel: checkedValue('traffic'),
    quietPeriods: [...form.querySelectorAll('[name="period"]:checked')].map(input => input.value),
    actualImpactStart: document.querySelector('#impact-start').value,
    actualImpactEnd: document.querySelector('#impact-end').value,
    accuracy: checkedValue('accuracy', '未判断'),
    note: note.value,
  };
  try {
    await backend.saveObservation(payload);
    saveStatus.textContent = '保存しました。今日もお疲れさまでした。';
  } catch (error) {
    saveStatus.classList.add('error');
    saveStatus.textContent = error.message || '保存できませんでした。';
  } finally {
    saveButton.disabled = false;
  }
});

async function initialize() {
  dateInput.value = localToday();
  backend = isCloudConfigured() ? await createCloudBackend() : createLocalBackend();
  await backend.initialize(async (user, errorMessage) => {
    currentUser = user;
    setRecordAccess(user, errorMessage);
    if (initialized) await loadDay();
  });
  setRecordAccess(currentUser);
  initialized = true;
  await loadDay();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

initialize().catch(error => {
  eventCount.textContent = '初期化失敗';
  eventsRoot.innerHTML = '<p class="empty-state">アプリを起動できませんでした。</p>';
  saveStatus.classList.add('error');
  saveStatus.textContent = error.message || 'アプリを起動できませんでした。';
});
