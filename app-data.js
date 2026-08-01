(function () {
  const EVENT_DATA_PATHS = ['./data/events.json', './data/store-events.json'];
  const MAX_EVENT_REFERENCES = 64;
  const MAX_CALENDAR_CONTEXTS = 16;
  const EVENT_STATUSES = new Set(['実施予定', '実施済み', '中止', '延期']);
  let calendarContextPromise;
  let eventDataPromise;

  function normalizedText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeEventIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizedText).filter(Boolean))].slice(0, MAX_EVENT_REFERENCES);
  }

  function normalizeRelatedEvents(value) {
    if (!Array.isArray(value)) return [];
    const byId = new Map();
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const id = normalizedText(item.id);
      if (!id) continue;
      const status = normalizedText(item.status);
      byId.set(id, {
        id,
        title: normalizedText(item.title) || '関連イベント',
        status: EVENT_STATUSES.has(status) ? status : '実施済み',
      });
    }
    return [...byId.values()].slice(0, MAX_EVENT_REFERENCES);
  }

  function normalizeCalendarContext(value) {
    if (!Array.isArray(value)) return [];
    const byKey = new Map();
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const type = normalizedText(item.type);
      const label = normalizedText(item.label);
      if (!type || !label) continue;
      byKey.set(`${type}\u0000${label}`, { type, label });
    }
    return [...byKey.values()].slice(0, MAX_CALENDAR_CONTEXTS);
  }

  function normalizeRecordArrays(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const relatedEvents = normalizeRelatedEvents(item.relatedEvents);
    const eventIds = normalizeEventIds([
      ...(Array.isArray(item.eventIds) ? item.eventIds : []),
      ...relatedEvents.map(event => event.id),
    ]);
    return {
      ...item,
      eventIds,
      relatedEvents: relatedEvents.filter(event => eventIds.includes(event.id)),
      calendarContext: normalizeCalendarContext(item.calendarContext),
    };
  }

  async function fetchJson(path, { fallback, errorMessage } = {}) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        if (fallback !== undefined) return fallback;
        throw new Error(errorMessage || 'データを読み込めませんでした');
      }
      return response.json();
    } catch (error) {
      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  async function loadCalendarContext() {
    if (!calendarContextPromise) {
      calendarContextPromise = fetchJson('./data/calendar-context.json', { fallback: { holidays: {}, periods: [] } });
    }
    return calendarContextPromise;
  }

  async function loadEventData(options = {}) {
    if (!eventDataPromise) {
      eventDataPromise = Promise.all([
        fetchJson(EVENT_DATA_PATHS[0], { errorMessage: 'イベント情報を読み込めませんでした' }),
        fetchJson(EVENT_DATA_PATHS[1], { fallback: [] }),
      ]).then(eventGroups => eventGroups.flat().sort(compareEventsByStart));
    }
    if (!options.fallbackToEmpty) return eventDataPromise;
    return eventDataPromise.catch(() => []);
  }

  function eventStartDate(event) {
    return String(event.startAt || '').slice(0, 10);
  }

  function eventEndDate(event) {
    return String(event.endAt || event.startAt || '').slice(0, 10);
  }

  function compareEventsByStart(a, b) {
    return String(a.startAt || '').localeCompare(String(b.startAt || ''));
  }

  function hasPredictedWindowOn(event, targetDate) {
    return (event.predictedWindows || []).some(predictedWindow => predictedWindow.date === targetDate);
  }

  function eventCoversDate(event, targetDate) {
    if (eventStartDate(event) === targetDate || hasPredictedWindowOn(event, targetDate)) return true;
    return Boolean(event.showEachDay && eventStartDate(event) <= targetDate && targetDate <= eventEndDate(event));
  }

  function isRecordLinkedEvent(event) {
    return event?.recordLink !== false;
  }

  function eventsForDay(events, targetDate) {
    return events.filter(event => eventCoversDate(event, targetDate));
  }

  async function eventsForDate(date) {
    return eventsForDay(await loadEventData(), date);
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

  async function enrichLegacyRecord(item) {
    if (!item) return item;
    const normalized = normalizeRecordArrays(item);
    const eventIds = normalized.eventIds;
    if (eventIds.length) {
      const events = await loadEventData({ fallbackToEmpty: true });
      const eventMap = new Map(events.map(event => [event.id, event]));
      const storedMap = new Map(normalized.relatedEvents.map(event => [event.id, event]));
      normalized.relatedEvents = eventIds.map(id => {
        const stored = storedMap.get(id) || {};
        const current = eventMap.get(id);
        return { id, title: current?.title || stored.title || '関連イベント', status: stored.status || '実施済み' };
      });
    }
    if (!normalized.calendarContext.length) normalized.calendarContext = await contextForDate(normalized.date);
    return normalizeRecordArrays(normalized);
  }

  window.AppData = {
    addDays,
    contextForDate,
    dateParts,
    enrichLegacyRecord,
    eventsForDate,
    eventsForDay,
    isRecordLinkedEvent,
    loadCalendarContext,
    loadEventData,
    localToday,
    normalizeRecordArrays,
  };
}());
