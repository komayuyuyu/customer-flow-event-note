import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class RecordArrayRuntimeTest(unittest.TestCase):
    def run_node(self, script, *paths):
        result = subprocess.run(
            [NODE, "-e", textwrap.dedent(script), *(str(path) for path in paths)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_record_arrays_are_normalized_without_mutating_the_input(self):
        self.run_node(
            """
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            global.fetch = async path => ({
              ok: true,
              async json() {
                if (path.includes('store-events')) return [];
                if (path.includes('events.json')) return [{ id: 'legacy-event', title: '現行タイトル' }];
                return { holidays: { '2026-01-01': '元日' }, periods: [] };
              },
            });
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            const { enrichLegacyRecord, normalizeRecordArrays } = window.AppData;
            const source = {
              date: '2026-01-01',
              eventIds: [null, ' event-1 ', 7, 'event-1'],
              relatedEvents: [
                null,
                ['invalid'],
                { id: '', title: 'invalid' },
                { id: 'event-1', title: 42, status: 'unknown' },
                { id: 'event-1', title: '更新タイトル', status: '延期' },
                { id: 'event-2', title: '追加イベント', status: '実施予定' },
              ],
              calendarContext: [
                null,
                { type: '祝日', label: ' 元日 ' },
                { type: '祝日', label: '元日' },
                { type: 1, label: 'invalid' },
              ],
            };
            const before = JSON.stringify(source);
            const normalized = normalizeRecordArrays(source);

            assert.equal(JSON.stringify(source), before);
            assert.notEqual(normalized, source);
            assert.deepEqual(normalized.eventIds, ['event-1', 'event-2']);
            assert.deepEqual(normalized.relatedEvents, [
              { id: 'event-1', title: '更新タイトル', status: '延期' },
              { id: 'event-2', title: '追加イベント', status: '実施予定' },
            ]);
            assert.deepEqual(normalized.calendarContext, [{ type: '祝日', label: '元日' }]);

            const limited = normalizeRecordArrays({
              eventIds: Array.from({ length: 70 }, (_, index) => `event-${index}`),
              calendarContext: Array.from({ length: 20 }, (_, index) => ({ type: '期間', label: `項目${index}` })),
            });
            assert.equal(limited.eventIds.length, 64);
            assert.equal(limited.calendarContext.length, 16);

            (async () => {
              const enriched = await enrichLegacyRecord({
                date: '2026-01-01',
                eventIds: ['legacy-event', null],
                relatedEvents: [null],
                calendarContext: [null],
              });
              assert.deepEqual(enriched.eventIds, ['legacy-event']);
              assert.deepEqual(enriched.relatedEvents, [
                { id: 'legacy-event', title: '現行タイトル', status: '実施済み' },
              ]);
              assert.deepEqual(enriched.calendarContext, [{ type: '祝日', label: '元日' }]);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """,
            ROOT / "app-data.js",
        )

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_cloud_backends_normalize_records_at_read_and_write_boundaries(self):
        self.run_node(
            """
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            global.fetch = async () => { throw new Error('Unexpected local API access'); };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            vm.runInThisContext(fs.readFileSync(process.argv[2], 'utf8'));

            const invalidRecord = {
              date: '2026-01-01',
              eventIds: [null, ' event-1 '],
              relatedEvents: [null, { id: 'event-1', title: 'イベント', status: '実施済み' }],
              calendarContext: [null, { type: '祝日', label: '元日' }],
            };
            const writes = [];
            const deletions = [];
            const firestoreSdk = {
              doc: (...parts) => parts.join('/'),
              collection: (...parts) => parts.join('/'),
              getDoc: async () => ({ exists: () => true, data: () => invalidRecord }),
              getDocs: async () => ({ docs: [{ data: () => invalidRecord }] }),
              setDoc: async (_reference, value) => { writes.push(value); },
              deleteDoc: async reference => { deletions.push(reference); },
              serverTimestamp: () => 'timestamp',
            };
            const user = { uid: 'owner' };
            window.FirebaseClient = {
              isConfigured: () => true,
              async create(_config, options = {}) {
                return {
                  async initialize() { options.onUserChange?.(user); return user; },
                  async login() { return user; },
                  async logout() {},
                  currentUser: () => user,
                  dataServices: () => ({ db: 'db', firestoreSdk }),
                };
              },
            };
            vm.runInThisContext(fs.readFileSync(process.argv[3], 'utf8'));

            (async () => {
              const backend = await window.AppBackend.createCloudBackend({
                config: { enabled: true },
                eventsForDate: async () => [],
              });
              await backend.initialize();
              const day = await backend.getDay('2026-01-01');
              assert.deepEqual(day.observation.eventIds, ['event-1']);
              assert.deepEqual(day.observation.calendarContext, [{ type: '祝日', label: '元日' }]);
              await backend.saveObservation({
                date: '2026-01-01',
                eventIds: [null, ' event-2 '],
                relatedEvents: [null, { id: 'event-2', title: '保存イベント', status: 'invalid' }],
                calendarContext: [null],
              });
              assert.deepEqual(writes.at(-1).eventIds, ['event-2']);
              assert.deepEqual(writes.at(-1).relatedEvents, [
                { id: 'event-2', title: '保存イベント', status: '実施済み' },
              ]);

              window.CUSTOMER_FLOW_FIREBASE_CONFIG = { enabled: true };
              vm.runInThisContext(fs.readFileSync(process.argv[4], 'utf8'));
              await window.RecordsBackend.initialize();
              const listed = await window.RecordsBackend.list();
              const loaded = await window.RecordsBackend.get('2026-01-01');
              assert.deepEqual(listed[0].eventIds, ['event-1']);
              assert.deepEqual(loaded.relatedEvents, [
                { id: 'event-1', title: 'イベント', status: '実施済み' },
              ]);
              await window.RecordsBackend.save({
                date: '2026-01-01',
                eventIds: [false, 'event-3'],
                relatedEvents: [{ id: 'event-3', title: null, status: '中止' }],
                calendarContext: [{ type: '大型連休', label: 3 }],
              });
              assert.deepEqual(writes.at(-1).eventIds, ['event-3']);
              assert.deepEqual(writes.at(-1).relatedEvents, [
                { id: 'event-3', title: '関連イベント', status: '中止' },
              ]);
              assert.deepEqual(writes.at(-1).calendarContext, []);
              await window.RecordsBackend.remove('2026-01-01');
              assert.equal(deletions.length, 1);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """,
            ROOT / "app-data.js",
            ROOT / "record-store.js",
            ROOT / "app-backend.js",
            ROOT / "records-backend.js",
        )


if __name__ == "__main__":
    unittest.main()
