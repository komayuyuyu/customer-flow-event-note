const cloudConfig = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
const {
  bindQuietPeriodExclusivity,
  bindTimePlaceholders,
  escapeHtml,
  readableAuthError,
  selectedQuietPeriods,
  syncTimePlaceholders,
} = window.UiUtils;
const { addDays, contextForDate, dateParts, eventsForDate, isRecordLinkedEvent, localToday } = window.AppData;
const { createCloudBackend, createLocalBackend, isCloudConfigured } = window.AppBackend;
const { create: createDatePicker } = window.AppDatePicker;
const {
  calendarContextEvent,
  renderCalendarEventCard,
  renderEmptyTodayEvent,
  renderTodayEventCard,
  renderWeekDay,
} = window.AppView;

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
let displayedWeekStart = '';

const MAX_WEEK_OFFSET = 9;

const datePicker = createDatePicker({
  dateInput,
  datePickerButton,
  calendarPopover,
  calendarMonth,
  calendarDays,
  calendarPrev,
  calendarNext,
  calendarToday,
  eventTitleHeading,
  dateParts,
  localToday,
  escapeHtml,
  async onSelect(value) {
    displayedWeekStart = startOfWeek(value);
    await loadDay();
  },
});
datePicker.bindEvents();

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

function syncImpactTimeFields() {
  const noImpact = checkedValue('eventImpact') === '感じなかった';
  setImpactTimeFieldsDisabled(noImpact);
  if (noImpact) clearImpactTimeFields();
  syncTimePlaceholders();
}

function impactTimeValues() {
  return {
    actualImpactStart: impactStartInput.value,
    actualImpactEnd: impactEndInput.value,
  };
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
    ...(event.predictedWindows || []).map(predictedWindow => predictedWindow.date),
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

function setRecordAccess(user, errorMessage = '') {
  const cloudMode = backend?.mode === 'cloud';
  if (!cloudMode) {
    authPanel.hidden = true;
    navAuthButton.hidden = true;
    form.classList.remove('is-locked');
    return;
  }

  const unlocked = Boolean(user);
  navAuthButton.hidden = false;
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
  eventsRoot.innerHTML = [
    ...calendarEvents.map(renderCalendarEventCard),
    ...events.map(event => renderTodayEventCard(event, dateInput.value)),
  ].join('');
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
  datePicker.updateButton();
  clearImpactTimeFields();
  note.value = '';
  noteCount.textContent = '0 / 600';
  saveActions.hidden = true;
}

function resetObservationForm() {
  clearForm();
  setChecked('weather', '不明');
  setChecked('accuracy', '未判断');
  syncImpactTimeFields();
}

async function loadDay() {
  saveStatus.textContent = '';
  saveStatus.classList.remove('error');
  saveActions.hidden = true;
  datePicker.updateEventHeading(dateInput.value);
  eventCount.textContent = '確認中';
  eventsRoot.innerHTML = '<p class="empty-state">読み込んでいます…</p>';
  try {
    const data = await backend.getDay(dateInput.value);
    const dateContext = await contextForDate(dateInput.value);
    renderEvents(data.events || [], dateContext);
    resetObservationForm();
    setRecordAccess(currentUser);
    await loadWeek();
  } catch (error) {
    eventCount.textContent = '取得失敗';
    eventsRoot.innerHTML = '<p class="empty-state">イベント情報を読み込めませんでした。</p>';
    saveStatus.classList.add('error');
    saveStatus.textContent = readableDataError(error, 'データを読み込めませんでした。');
  }
}

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
note.addEventListener('input', () => { noteCount.textContent = `${note.value.length} / 600`; });
bindTimePlaceholders();
bindQuietPeriodExclusivity(form);
form.addEventListener('change', event => {
  if (event.target.name !== 'eventImpact') return;
  syncImpactTimeFields();
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
    quietPeriods: selectedQuietPeriods(form),
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
    resetObservationForm();
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
  await datePicker.select(addDays(dateInput.value, -1));
  document.querySelector('#record-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function initialize() {
  const requestedDate = new URLSearchParams(location.search).get('date');
  dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : localToday();
  displayedWeekStart = startOfWeek(dateInput.value);
  datePicker.updateButton();
  syncTimePlaceholders();
  const handleUserChange = async (user, error) => {
    currentUser = user;
    const errorMessage = error?.message === 'このGoogleアカウントには記録権限がありません。'
      ? error.message
      : error ? readableAuthError(error) : '';
    setRecordAccess(user, errorMessage);
    if (initialized) await loadDay();
  };
  backend = isCloudConfigured(cloudConfig)
    ? await createCloudBackend({ config: cloudConfig, eventsForDate, onUserChange: handleUserChange })
    : createLocalBackend({ eventsForDate });
  await backend.initialize();
  setRecordAccess(currentUser);
  initialized = true;
  await loadDay();
  if (location.hash === '#record-form') requestAnimationFrame(() => requestAnimationFrame(() => form.scrollIntoView({ block: 'start' })));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=20260801-18', { updateViaCache: 'none' }).catch(() => {});
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
