(function () {
  const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'long' });

  function create(options) {
    const {
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
      onSelect,
    } = options;
    let calendarCursor;

    function updateButton() {
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

    function setOpen(open, anchor = null) {
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

    async function select(value) {
      dateInput.value = value;
      updateButton();
      setOpen(false);
      await onSelect(value);
    }

    function eventHeadingLabel(dateText) {
      const { month, day } = dateParts(dateText);
      const date = new Date(`${dateText}T12:00:00`);
      const dayOfWeek = weekday.format(date).replace('曜日', '');
      return `${month}月${day}日（${dayOfWeek}）`;
    }

    function openForRecord(anchor = null) {
      if (anchor) {
        setOpen(true, anchor);
        return;
      }
      const datePickerVisible = datePickerButton && getComputedStyle(datePickerButton).display !== 'none';
      if (datePickerVisible) {
        setOpen(true);
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
        openForRecord(event.currentTarget);
      });
    }

    function bindEvents() {
      dateInput.addEventListener('change', () => {
        updateButton();
        onSelect(dateInput.value);
      });
      calendarToday.addEventListener('click', () => select(localToday()));
      datePickerButton.addEventListener('click', () => setOpen(calendarPopover.hidden));
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
        if (button) select(button.dataset.date);
      });
      document.addEventListener('click', event => {
        const calendarTarget = event.target.closest('.date-row, .calendar-popover, .event-title-date-button');
        if (!calendarPopover.hidden && !calendarTarget) setOpen(false);
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !calendarPopover.hidden) setOpen(false);
      });
    }

    return { bindEvents, select, updateButton, updateEventHeading };
  }

  window.AppDatePicker = { create };
}());
