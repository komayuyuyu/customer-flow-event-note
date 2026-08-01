(function () {
  const { dateParts } = window.AppData;
  const { displayEventTitle, escapeHtml, safeExternalUrl } = window.UiUtils;

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

  function formatPredictedWindow(predictedWindow) {
    return `${predictedWindow.label}：${predictedWindow.start}〜${predictedWindow.end}`;
  }

  function dottedDate(dateText) {
    const { year, month, day } = dateParts(dateText);
    return `${String(year).slice(-2)}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  }

  function eventTime(event) {
    const start = event.startAt ? new Date(event.startAt) : null;
    if (!start || Number.isNaN(start.getTime())) return '時刻未定';
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(start);
  }

  function renderWeekDay(day) {
    const calendarEvents = renderWeekContextEvents(day.context);
    const hasDisplayEvents = day.events.length || calendarEvents;
    const rowClass = hasDisplayEvents ? 'has-events' : 'is-empty';
    return `<div class="week-row ${rowClass}">
      <div class="week-date"><strong>${escapeHtml(dottedDate(day.date))}</strong>${renderDayImpactBadge(day.events)}</div>
      <div class="week-events">${calendarEvents}${hasDisplayEvents ? renderWeekEvents(day.events, false) : renderWeekEvents(day.events, true)}</div>
    </div>`;
  }

  function renderDayImpactBadge(events) {
    if (!events.length) return '';
    const order = { '大': 3, '中': 2, '小': 1 };
    const impact = events
      .map(event => event.impactLevel || '小')
      .sort((a, b) => (order[b] || 0) - (order[a] || 0))[0] || '小';
    return `<span class="week-day-impact ${impact === '大' ? 'high' : ''}">影響 ${escapeHtml(impact)}</span>`;
  }

  function renderWeekContextEvents(contextItems = []) {
    return contextItems.map(item => `<div class="week-event calendar-week-event">
      <div class="week-event-head"><span class="week-event-name">${escapeHtml(compactCalendarLabel(item))}</span></div>
      <span class="week-event-time">終日・${escapeHtml(item.type || 'カレンダー')}</span>
    </div>`).join('');
  }

  function renderWeekEvents(events = [], showEmpty = true) {
    if (!events.length) return showEmpty ? `<span class="week-empty">${EMPTY_WEEK_EVENT_TEXT}</span>` : '';
    return events.map(renderWeekEvent).join('');
  }

  function eventSourceUrl(event = {}) {
    const sources = Array.isArray(event.sources) ? event.sources : [];
    return sources.map(item => safeExternalUrl(item?.url)).find(Boolean) || '';
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
      <div class="week-event-head"><span class="week-event-name">${renderEventTitle(event)}</span></div>
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

  function calendarContextEvent(item, dateText) {
    const title = compactCalendarLabel(item);
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

  function renderEmptyTodayEvent() {
    return `<div class="empty-state event-empty-state"><div class="event-title-row event-empty-title"><span>${EMPTY_EVENT_TEXT}</span></div></div>`;
  }

  function renderCalendarEventCard(event) {
    return `<article class="event-card calendar-event-card">
      <div class="event-title-row"><h3>${escapeHtml(event.title || DEFAULT_EVENT_TITLE)}</h3></div>
      <div class="event-meta"><span class="tag">${escapeHtml(event.category || 'カレンダー')}</span><span class="tag">終日</span></div>
    </article>`;
  }

  function renderTodayEventCard(event, dateText) {
    return `<article class="event-card">
      <div class="event-title-row"><h3>${renderEventTitle(event)}</h3></div>
      ${renderEventMeta(event)}
      ${event.liveReason ? `<p>${escapeHtml(event.liveReason)}</p>` : ''}
      ${renderChampionshipCountdown(event)}
      ${renderEventDetails(event)}
      ${renderPredictedWindows(event, dateText)}
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
    return compactBroadcastLabels(broadcast).map(label => `<span class="tag">${escapeHtml(label)}</span>`).join('');
  }

  function renderChampionshipCountdown(event, className = 'event-countdown') {
    const wins = event.championship?.winsToTitle;
    return wins ? `<p class="${className}">あと${escapeHtml(wins)}勝で優勝</p>` : '';
  }

  function renderEventDetails(event) {
    const items = [];
    if (event.championship?.condition) items.push(`優勝条件：${event.championship.condition}`);
    if (event.championship?.runnerUpCondition) items.push(`逆転条件：${event.championship.runnerUpCondition}`);
    if (event.broadcast) items.push(`放送・配信：${event.broadcast}`);
    if (event.trafficReason) items.push(`メモ：${event.trafficReason}`);
    if (!items.length) return '';
    return `<ul class="event-detail-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  function renderPredictedWindows(event, dateText) {
    return (event.predictedWindows || [])
      .filter(predictedWindow => predictedWindow.date === dateText)
      .map(predictedWindow => {
        const reason = predictedWindow.reason ? `<br>${escapeHtml(predictedWindow.reason)}` : '';
        return `<p>${escapeHtml(formatPredictedWindow(predictedWindow))}${reason}</p>`;
      })
      .join('');
  }

  window.AppView = {
    calendarContextEvent,
    compactBroadcastLabels,
    compactCalendarLabel,
    eventSourceUrl,
    renderCalendarEventCard,
    renderEmptyTodayEvent,
    renderEventTitle,
    renderTodayEventCard,
    renderWeekDay,
    renderWeekEvent,
    renderWeekContextEvents,
    renderChampionshipCountdown,
  };
}());
