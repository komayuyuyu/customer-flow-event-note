import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class RecordPagesRuntimeTest(unittest.TestCase):
    def run_node(self, script, page_script):
        result = subprocess.run(
            [
                NODE,
                "-e",
                textwrap.dedent(script),
                str(ROOT / "ui-utils.js"),
                str(ROOT / page_script),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_records_page_paginates_escapes_and_deletes(self):
        self.run_node(
            r"""
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            class FakeElement {
              constructor() {
                this.classList = { add() {}, remove() {} };
                this.dataset = {};
                this.disabled = false;
                this.hidden = false;
                this.innerHTML = '';
                this.listeners = {};
                this.textContent = '';
              }
              addEventListener(type, listener) { this.listeners[type] = listener; }
              dispatch(type, event = {}) { return this.listeners[type](event); }
              querySelectorAll() { return []; }
              scrollIntoView() { this.scrolled = true; }
            }

            const selectors = [
              '#records-list',
              '#records-pagination',
              '#records-auth',
              '#login-button',
              '#nav-auth-button',
              '#delete-modal',
              '#delete-target-date',
              '#cancel-delete-button',
              '#confirm-delete-button',
              '.page-intro',
            ];
            const elements = new Map(selectors.map(selector => [selector, new FakeElement()]));
            global.document = { querySelector: selector => elements.get(selector) || null };
            global.location = {
              href: 'https://example.test/records.html?page=2',
              search: '?page=2',
            };
            let replacedUrl = '';
            global.history = {
              replaceState(_state, _title, url) { replacedUrl = url.toString(); },
            };
            global.window = {};
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            const records = Array.from({ length: 12 }, (_, index) => ({
              date: `2026-08-${String(index + 1).padStart(2, '0')}`,
              trafficLevel: index === 10 ? '<script>alert(1)</script>' : '通常',
              weather: '晴れ',
              eventImpact: 'わからない',
              eventIds: [],
              relatedEvents: index === 10
                ? [{ id: 'unsafe', title: '<img src=x onerror=alert(1)>', status: '延期' }]
                : [],
              calendarContext: index === 10
                ? [{ type: '<b>祝日</b>', label: '<i>危険</i>' }]
                : [],
            }));
            let initialized;
            let authCallback;
            let recordsResult = Promise.resolve(records);
            const removedDates = [];
            global.RecordsBackend = {
              currentUser: () => ({ uid: 'owner' }),
              initialize(callback) {
                authCallback = callback;
                initialized = Promise.resolve().then(() => callback({ uid: 'owner' }));
                return initialized;
              },
              list: () => recordsResult,
              login: async () => {},
              logout: async () => {},
              remove: async date => { removedDates.push(date); },
            };
            window.AppData = { loadEventData: async () => [] };

            vm.runInThisContext(fs.readFileSync(process.argv[2], 'utf8'));

            (async () => {
              await initialized;
              const list = elements.get('#records-list');
              const pagination = elements.get('#records-pagination');
              const modal = elements.get('#delete-modal');

              assert.equal(elements.get('#records-auth').hidden, true);
              assert.equal(elements.get('#nav-auth-button').textContent, 'ログアウト');
              assert.equal(pagination.hidden, false);
              assert.match(pagination.innerHTML, /aria-current="page">2<\/button>/);
              assert.match(list.innerHTML, /2026\/08\/11/);
              assert.match(list.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
              assert.match(list.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
              assert.match(list.innerHTML, /&lt;b&gt;祝日&lt;\/b&gt;/);
              assert.doesNotMatch(list.innerHTML, /<img|<script|<b>祝日/);
              assert.equal(replacedUrl, 'https://example.test/records.html?page=2');

              pagination.dispatch('click', {
                target: { closest: () => ({ dataset: { page: '1' }, disabled: false }) },
              });
              assert.match(list.innerHTML, /2026\/08\/01/);
              assert.doesNotMatch(list.innerHTML, /2026\/08\/11/);
              assert.equal(replacedUrl, 'https://example.test/records.html');
              assert.equal(elements.get('.page-intro').scrolled, true);

              list.dispatch('click', {
                target: { closest: () => ({ dataset: { deleteDate: '2026-08-01' } }) },
              });
              assert.equal(modal.hidden, false);
              assert.match(elements.get('#delete-target-date').textContent, /2026\/08\/01/);

              await elements.get('#confirm-delete-button').dispatch('click');
              assert.deepEqual(removedDates, ['2026-08-01']);
              assert.equal(modal.hidden, true);
              assert.equal(elements.get('#confirm-delete-button').disabled, false);

              let releaseStaleRecords;
              recordsResult = new Promise(resolve => { releaseStaleRecords = resolve; });
              const staleLoad = authCallback({ uid: 'owner' });
              await new Promise(resolve => setImmediate(resolve));
              await authCallback(null);
              releaseStaleRecords(records);
              await staleLoad;
              assert.match(list.innerHTML, /ログインすると記録一覧を表示します。/);
              assert.doesNotMatch(list.innerHTML, /2026\/08\/01/);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """,
            "records.js",
        )

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_record_detail_renders_edits_cancels_saves_and_deletes(self):
        self.run_node(
            r"""
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            class FakeElement {
              constructor(value = '') {
                this.classList = { add: name => { this.addedClass = name; }, remove() {} };
                this.disabled = false;
                this.hidden = false;
                this.innerHTML = '';
                this.listeners = {};
                this.textContent = '';
                this.value = value;
                this.selectedPeriods = [];
              }
              addEventListener(type, listener) { this.listeners[type] = listener; }
              dispatch(type, event = {}) { return this.listeners[type](event); }
              querySelectorAll(selector) {
                if (selector === '[name="period"]:checked') return this.selectedPeriods;
                return [];
              }
            }

            const values = {
              '#traffic': '混雑',
              '#weather': '雨',
              '#impact-start': '17:30',
              '#impact-end': '19:00',
              '#impact': 'あり',
              '#accuracy': '予測通り',
              '#note': '更新後メモ',
              '.event-status[data-index="0"]': '中止',
            };
            const selectors = [
              '#record-detail',
              '#nav-auth-button',
              '#delete-modal',
              '#delete-target-date',
              '#cancel-delete-button',
              '#confirm-delete-button',
              '#edit-button',
              '#delete-record-button',
              '#detail-form',
              '#cancel-button',
              '#edit-status',
              ...Object.keys(values),
            ];
            const elements = new Map(selectors.map(selector => [
              selector,
              new FakeElement(values[selector] || ''),
            ]));
            elements.get('#detail-form').selectedPeriods = [{ value: '16〜17時' }];
            global.document = { querySelector: selector => elements.get(selector) || null };
            global.location = {
              href: 'https://example.test/record.html?date=2026-08-01',
              search: '?date=2026-08-01',
            };
            global.window = {};
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            window.AppData = { enrichLegacyRecord: async record => record };

            const sourceRecord = {
              date: '2026-08-01',
              trafficLevel: '通常',
              weather: '晴れ',
              quietPeriods: ['特になし'],
              actualImpactStart: '',
              actualImpactEnd: '',
              eventImpact: 'わからない',
              accuracy: '未判断',
              customerTopics: '',
              note: '<script>alert(1)</script>',
              eventIds: ['event-1'],
              relatedEvents: [{
                id: 'event-1',
                title: '<img src=x onerror=alert(1)>',
                status: '実施予定',
              }],
              calendarContext: [{ type: '<b>祝日</b>', label: '<i>危険</i>' }],
            };
            let initialized;
            let authCallback;
            let savedRecord;
            let rejectSave = true;
            let saveCalls = 0;
            let saveGate = Promise.resolve();
            let recordResult = Promise.resolve(sourceRecord);
            const removedDates = [];
            global.RecordsBackend = {
              currentUser: () => ({ uid: 'owner' }),
              get: date => {
                assert.equal(date, '2026-08-01');
                return recordResult;
              },
              initialize(callback) {
                authCallback = callback;
                initialized = Promise.resolve().then(() => callback({ uid: 'owner' }));
                return initialized;
              },
              login: async () => {},
              logout: async () => {},
              remove: async date => { removedDates.push(date); },
              save: async record => {
                saveCalls += 1;
                savedRecord = record;
                if (rejectSave) throw new Error('保存に失敗しました。');
                await saveGate;
              },
            };

            vm.runInThisContext(fs.readFileSync(process.argv[2], 'utf8'));

            (async () => {
              await initialized;
              const detail = elements.get('#record-detail');
              const modal = elements.get('#delete-modal');

              assert.equal(elements.get('#nav-auth-button').textContent, 'ログアウト');
              assert.match(detail.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
              assert.match(detail.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
              assert.match(detail.innerHTML, /&lt;b&gt;祝日&lt;\/b&gt;/);
              assert.doesNotMatch(detail.innerHTML, /<img|<script|<b>祝日/);

              elements.get('#edit-button').dispatch('click');
              assert.match(detail.innerHTML, /<form id="detail-form">/);
              assert.match(detail.innerHTML, /変更を保存/);

              elements.get('#cancel-button').dispatch('click');
              assert.match(detail.innerHTML, /class="detail-grid"/);
              assert.doesNotMatch(detail.innerHTML, /<form id="detail-form">/);

              elements.get('#edit-button').dispatch('click');
              await elements.get('#detail-form').dispatch('submit', { preventDefault() {} });
              assert.equal(elements.get('#edit-status').textContent, '保存に失敗しました。');
              assert.equal(elements.get('#edit-status').addedClass, 'error');
              elements.get('#cancel-button').dispatch('click');
              assert.match(detail.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
              assert.doesNotMatch(detail.innerHTML, /更新後メモ/);

              rejectSave = false;
              saveCalls = 0;
              let releaseSave;
              saveGate = new Promise(resolve => { releaseSave = resolve; });
              elements.get('#edit-button').dispatch('click');
              const submitButton = new FakeElement();
              const firstSave = elements.get('#detail-form').dispatch('submit', {
                preventDefault() {},
                submitter: submitButton,
              });
              const duplicateSave = elements.get('#detail-form').dispatch('submit', {
                preventDefault() {},
                submitter: submitButton,
              });
              await new Promise(resolve => setImmediate(resolve));
              assert.equal(saveCalls, 1);
              assert.equal(submitButton.disabled, true);
              releaseSave();
              await Promise.all([firstSave, duplicateSave]);
              assert.equal(submitButton.disabled, false);
              assert.equal(savedRecord.trafficLevel, '混雑');
              assert.equal(savedRecord.weather, '雨');
              assert.deepEqual(savedRecord.quietPeriods, ['16〜17時']);
              assert.equal(savedRecord.actualImpactStart, '17:30');
              assert.equal(savedRecord.actualImpactEnd, '19:00');
              assert.equal(savedRecord.eventImpact, 'あり');
              assert.equal(savedRecord.accuracy, '予測通り');
              assert.equal(savedRecord.customerTopics, '');
              assert.equal(savedRecord.note, '更新後メモ');
              assert.equal(savedRecord.relatedEvents[0].status, '中止');
              assert.match(detail.innerHTML, /更新後メモ/);

              elements.get('#delete-record-button').dispatch('click');
              assert.equal(modal.hidden, false);
              assert.equal(elements.get('#delete-target-date').textContent, '2026-08-01');
              elements.get('#cancel-delete-button').dispatch('click');
              assert.equal(modal.hidden, true);

              elements.get('#delete-record-button').dispatch('click');
              await elements.get('#confirm-delete-button').dispatch('click');
              assert.deepEqual(removedDates, ['2026-08-01']);
              assert.equal(location.href, './records.html');

              location.href = 'https://example.test/record.html?date=2026-08-01';
              let releaseStaleRecord;
              recordResult = new Promise(resolve => { releaseStaleRecord = resolve; });
              const staleLoad = authCallback({ uid: 'owner' });
              await new Promise(resolve => setImmediate(resolve));
              await authCallback(null);
              releaseStaleRecord(sourceRecord);
              await staleLoad;
              assert.match(detail.innerHTML, /記録を見るにはGoogleログインが必要です。/);
              assert.doesNotMatch(detail.innerHTML, /class="detail-grid"/);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """,
            "record.js",
        )


if __name__ == "__main__":
    unittest.main()
