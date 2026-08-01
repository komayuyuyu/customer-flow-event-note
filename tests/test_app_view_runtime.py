import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class AppViewRuntimeTest(unittest.TestCase):
    def run_node(self, script):
        result = subprocess.run(
            [
                NODE,
                "-e",
                textwrap.dedent(script),
                str(ROOT / "ui-utils.js"),
                str(ROOT / "app-data.js"),
                str(ROOT / "app-view.js"),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_event_cards_escape_values_and_only_link_to_safe_web_urls(self):
        self.run_node(
            r"""
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            for (const path of process.argv.slice(1)) {
              vm.runInThisContext(fs.readFileSync(path, 'utf8'));
            }

            const { safeExternalUrl } = window.UiUtils;
            const { eventSourceUrl, renderEventTitle, renderTodayEventCard } = window.AppView;

            assert.equal(safeExternalUrl('javascript:alert(1)'), '');
            assert.equal(safeExternalUrl('https://user:pass@example.com/private'), '');
            assert.equal(eventSourceUrl({ sources: [{ url: 'javascript:alert(1)' }] }), '');

            const unsafeTitle = renderEventTitle({
              title: '<img src=x onerror=alert(1)>',
              sources: [{ url: 'javascript:alert(1)' }],
            });
            assert.equal(unsafeTitle, '&lt;img src=x onerror=alert(1)&gt;');
            assert.doesNotMatch(unsafeTitle, /href=/);

            const event = {
              title: '<img src=x onerror=alert(1)>',
              sources: [
                { url: 'https://user:pass@example.com/private' },
                { url: 'https://example.com/event?x=1&y=2' },
              ],
              impactLevel: '<script>alert(1)</script>',
              category: '<b>祭り</b>',
              area: '<i>兵庫</i>',
              broadcast: '配信<script>alert(1)</script>',
              liveReason: '<svg onload=alert(1)>',
              trafficReason: '<iframe src=x>',
              championship: { winsToTitle: '<em>2</em>' },
              predictedWindows: [{
                date: '2026-08-01',
                label: '<u>開催中</u>',
                start: '19:00',
                end: '20:00',
                reason: '<script>reason</script>',
              }],
            };
            const html = renderTodayEventCard(event, '2026-08-01');

            assert.match(html, /href="https:\/\/example\.com\/event\?x=1&amp;y=2"/);
            assert.match(html, /target="_blank" rel="noopener noreferrer"/);
            assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
            assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
            assert.match(html, /&lt;svg onload=alert\(1\)&gt;/);
            assert.match(html, /&lt;iframe src=x&gt;/);
            assert.match(html, /&lt;em&gt;2&lt;\/em&gt;/);
            assert.match(html, /&lt;u&gt;開催中&lt;\/u&gt;：19:00〜20:00/);
            assert.match(html, /&lt;script&gt;reason&lt;\/script&gt;/);
            assert.doesNotMatch(html, /<script|<img|<svg|<iframe|<em|<u>/);
            """
        )

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_week_and_calendar_rendering_preserve_visible_contracts(self):
        self.run_node(
            r"""
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            for (const path of process.argv.slice(1)) {
              vm.runInThisContext(fs.readFileSync(path, 'utf8'));
            }

            const {
              calendarContextEvent,
              renderCalendarEventCard,
              renderEmptyTodayEvent,
              renderWeekDay,
            } = window.AppView;

            const contextEvent = calendarContextEvent(
              { type: '祝日', label: '元日' },
              '2026-01-01',
            );
            assert.deepEqual(contextEvent, {
              id: 'calendar-2026-01-01-祝日-元日',
              title: '元日',
              status: '実施予定',
              startAt: '2026-01-01T00:00:00+09:00',
              endAt: '2026-01-01T23:59:00+09:00',
              category: '祝日',
              area: '全国',
              confidence: '高',
              impactLevel: '中',
              calendarContextEvent: true,
            });

            const weekHtml = renderWeekDay({
              date: '2026-01-01',
              context: [{ type: '祝日', label: '元日' }],
              events: [{
                title: 'JPN 対 USA',
                startAt: '2026-01-01T20:30:00+09:00',
                area: '全国',
                impactLevel: '大',
                championship: { winsToTitle: 2 },
                sources: [{ url: 'https://example.com/game' }],
              }],
            });
            assert.match(weekHtml, /class="week-row has-events"/);
            assert.match(weekHtml, /26\.01\.01/);
            assert.match(weekHtml, /影響 大/);
            assert.match(weekHtml, /元日/);
            assert.match(weekHtml, />対 USA<\/a>/);
            assert.match(weekHtml, /20:30開始・全国/);
            assert.match(weekHtml, /あと2勝で優勝/);

            const emptyWeek = renderWeekDay({ date: '2026-01-02', context: [], events: [] });
            assert.match(emptyWeek, /class="week-row is-empty"/);
            assert.match(emptyWeek, /影響イベントなし/);
            assert.match(renderEmptyTodayEvent(), /イベントなし/);

            const calendarHtml = renderCalendarEventCard({
              title: '<b>元日</b>',
              category: '<i>祝日</i>',
            });
            assert.match(calendarHtml, /&lt;b&gt;元日&lt;\/b&gt;/);
            assert.match(calendarHtml, /&lt;i&gt;祝日&lt;\/i&gt;/);
            assert.doesNotMatch(calendarHtml, /<b>|<i>/);
            """
        )


if __name__ == "__main__":
    unittest.main()
