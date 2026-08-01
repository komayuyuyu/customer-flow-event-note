import os
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class AppFormRuntimeTest(unittest.TestCase):
    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_impact_time_inputs_are_reenabled_after_form_resets(self):
        result = subprocess.run(
            [
                NODE,
                "-e",
                textwrap.dedent(
                    r"""
                    const assert = require('node:assert/strict');
                    const fs = require('node:fs');
                    const vm = require('node:vm');

                    class FakeElement {
                      constructor() {
                        this.checkedValues = {};
                        this.classList = { add() {}, remove() {}, toggle() {} };
                        this.disabled = false;
                        this.hidden = false;
                        this.innerHTML = '';
                        this.listeners = new Map();
                        this.textContent = '';
                        this.value = '';
                      }
                      addEventListener(type, listener) {
                        const listeners = this.listeners.get(type) || [];
                        listeners.push(listener);
                        this.listeners.set(type, listeners);
                      }
                      async dispatch(type, event = {}) {
                        for (const listener of this.listeners.get(type) || []) await listener(event);
                      }
                      click() { return this.dispatch('click'); }
                      querySelector(selector) {
                        const checked = selector.match(/^\[name="([^"]+)"\]:checked$/);
                        if (checked) {
                          const value = this.checkedValues[checked[1]];
                          return value ? { value } : null;
                        }
                        const option = selector.match(/^\[name="([^"]+)"\]\[value="([^"]*)"\]$/);
                        if (option) {
                          const root = this;
                          return {
                            set checked(value) {
                              if (value) root.checkedValues[option[1]] = option[2];
                            },
                          };
                        }
                        return null;
                      }
                      querySelectorAll() { return []; }
                      reset() { this.checkedValues = {}; }
                      scrollIntoView() {}
                    }

                    const selectors = [
                      '#record-date',
                      '#date-picker-button',
                      '#calendar-popover',
                      '#calendar-month',
                      '#calendar-days',
                      '#calendar-prev',
                      '#calendar-next',
                      '#calendar-today',
                      '#event-title',
                      '#events',
                      '#event-count',
                      '#week-schedule',
                      '#week-count',
                      '#week-label',
                      '#week-prev',
                      '#week-next',
                      '#record-form',
                      '#impact-start',
                      '#impact-end',
                      '#note',
                      '#note-count',
                      '#save-status',
                      '#record-context',
                      '#accuracy-fieldset',
                      '#save-button',
                      '#auth-panel',
                      '#auth-title',
                      '#auth-message',
                      '#login-button',
                      '#logout-button',
                      '#nav-auth-button',
                      '#related-events',
                      '#event-impact-fieldset',
                      '#save-actions',
                      '#detail-link',
                      '#continue-button',
                    ];
                    const elements = new Map(selectors.map(selector => [selector, new FakeElement()]));
                    const formElement = elements.get('#record-form');
                    global.document = {
                      querySelector: selector => elements.get(selector) || null,
                      querySelectorAll: () => [],
                    };
                    global.location = { hash: '', search: '' };
                    global.CSS = { escape: value => value };
                    global.requestAnimationFrame = callback => callback();
                    Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
                    global.window = {};

                    window.UiUtils = {
                      bindQuietPeriodExclusivity() {},
                      bindTimePlaceholders() {},
                      escapeHtml: value => String(value ?? ''),
                      readableAuthError: error => error?.message || '',
                      selectedQuietPeriods: () => [],
                      syncTimePlaceholders() {},
                    };
                    function addDaysMock(value, amount) {
                      const date = new Date(`${value}T12:00:00Z`);
                      date.setUTCDate(date.getUTCDate() + amount);
                      return date.toISOString().slice(0, 10);
                    }
                    window.AppData = {
                      addDays: addDaysMock,
                      contextForDate: async () => [],
                      dateParts: value => ({ year: Number(value.slice(0, 4)) }),
                      eventsForDate: async () => [],
                      isRecordLinkedEvent: () => true,
                      loadEventData: async () => [],
                      localToday: () => '2026-08-01',
                    };
                    const backendMock = {
                      mode: 'local',
                      getDay: async () => ({ events: [{
                        id: 'event-1',
                        title: 'イベント',
                        status: '実施予定',
                        startAt: '2026-08-01T18:00:00+09:00',
                      }] }),
                      getEvents: async () => [],
                      initialize: async () => null,
                      login: async () => null,
                      logout: async () => null,
                      saveObservation: async () => null,
                    };
                    window.AppBackend = {
                      createCloudBackend: async () => backendMock,
                      createLocalBackend: () => backendMock,
                      isCloudConfigured: () => false,
                    };
                    let createdDatePicker;
                    window.AppDatePicker = {
                      create(options) {
                        createdDatePicker = {
                          bindEvents() {},
                          async select(value) {
                            elements.get('#record-date').value = value;
                            await options.onSelect(value);
                          },
                          updateButton() {},
                          updateEventHeading() {},
                        };
                        return createdDatePicker;
                      },
                    };
                    window.AppView = {
                      calendarContextEvent: item => item,
                      renderCalendarEventCard: () => '',
                      renderEmptyTodayEvent: () => '',
                      renderTodayEventCard: () => '',
                      renderWeekDay: () => '',
                    };

                    vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

                    async function waitForInitialization() {
                      for (let attempt = 0; attempt < 20; attempt += 1) {
                        if (elements.get('#event-count').textContent === '1件') return;
                        await new Promise(resolve => setImmediate(resolve));
                      }
                      throw new Error('app initialization did not finish');
                    }

                    (async () => {
                      await waitForInitialization();
                      const impactStart = elements.get('#impact-start');
                      const impactEnd = elements.get('#impact-end');
                      assert.equal(impactStart.disabled, false);
                      assert.equal(impactEnd.disabled, false);

                      impactStart.value = '17:30';
                      impactEnd.value = '19:00';
                      formElement.checkedValues.eventImpact = '感じなかった';
                      await formElement.dispatch('change', {
                        target: { name: 'eventImpact', value: '感じなかった' },
                      });
                      assert.equal(impactStart.disabled, true);
                      assert.equal(impactEnd.disabled, true);
                      assert.equal(impactStart.value, '');
                      assert.equal(impactEnd.value, '');

                      await createdDatePicker.select('2026-08-02');
                      assert.equal(formElement.checkedValues.eventImpact, undefined);
                      assert.equal(impactStart.disabled, false);
                      assert.equal(impactEnd.disabled, false);

                      formElement.checkedValues.eventImpact = '感じなかった';
                      await formElement.dispatch('change', {
                        target: { name: 'eventImpact', value: '感じなかった' },
                      });
                      await formElement.dispatch('submit', { preventDefault() {} });
                      assert.equal(formElement.checkedValues.eventImpact, undefined);
                      assert.equal(impactStart.disabled, false);
                      assert.equal(impactEnd.disabled, false);
                    })().catch(error => { console.error(error); process.exitCode = 1; });
                    """
                ),
                str(ROOT / "app.js"),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
            env={**os.environ, "TZ": "UTC"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
