const cloudConfig = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
const { bindTimePlaceholders, combinedMemo, escapeHtml, readableAuthError, syncTimePlaceholders } = window.UiUtils;
const { addDays, contextForDate, dateParts, eventsForDate, isRecordLinkedEvent, localToday } = window.AppData;
const { createCloudBackend, createLocalBackend, isCloudConfigured } = window.AppBackend;
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
let calendarCursor;
let displayedWeekStart = '';

const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'long' });
const MAX_WEEK_OFFSET = 9;

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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=20260801-03', { updateViaCache: 'none' }).catch(() => {});
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
