import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StaticContractTest(unittest.TestCase):
    def test_public_assets_are_present(self):
        for name in (
            "index.html",
            "records.html",
            "record.html",
            "styles.css",
            "app.js",
            "records.js",
            "record.js",
            "records-backend.js",
            "app-data.js",
            "ui-utils.js",
            "menu.js",
            "firebase-config.js",
            "sw.js",
            "manifest.webmanifest",
            "icon.svg",
            "data/events.json",
            "data/store-events.json",
            "data/calendar-context.json",
        ):
            self.assertTrue((ROOT / name).is_file(), name)

    def test_static_asset_version_is_consistent(self):
        for name in ("index.html", "records.html", "record.html"):
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn("styles.css?v=20260703-34", html)
            self.assertIn("ui-utils.js?v=20260703-34", html)
            self.assertIn("app-data.js?v=20260703-34", html)
            self.assertIn("EVENT INFO ＆ CUSTOMER NOTE", html)
            self.assertNotIn("IVENT INFO", html)

        service_worker = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("const VERSION = '20260703-34';", service_worker)
        self.assertIn("app-data.js?v=${VERSION}", service_worker)
        self.assertIn("ui-utils.js?v=${VERSION}", service_worker)
        self.assertIn("./data/store-events.json", service_worker)

    def test_event_update_tooling_is_present(self):
        self.assertTrue((ROOT / "impact.py").is_file())
        self.assertTrue((ROOT / "scripts" / "evaluate_candidates.py").is_file())
        self.assertTrue((ROOT / "data" / "candidates.json").is_file())
        candidates = json.loads((ROOT / "data" / "candidates.json").read_text(encoding="utf-8"))
        self.assertIsInstance(candidates, list)

    def test_core_ui_contracts(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        index = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn("function renderTodayEventCard", app)
        self.assertIn("function renderWeekEvent", app)
        self.assertIn("function updateEventHeading", app)
        self.assertIn("function openRecordDatePicker", app)
        self.assertIn("function renderCalendarEventCard", app)
        self.assertIn("function renderWeekContextEvents", app)
        self.assertIn("function calendarContextEvent", app)
        self.assertIn("function dottedDate", app)
        self.assertIn("function positionCalendarAt", app)
        self.assertIn("function weekOfYearMonday", app)
        self.assertIn("String(year).slice(-2)", app)
        self.assertIn("${month}月${day}日", app)
        self.assertIn("String(month).padStart(2, '0')", app)
        self.assertIn("weekLabel.textContent = start === current ? '今週' : `第${weekOfYearMonday(start)}週`;", app)
        self.assertIn("event-title-date-button", app)
        self.assertIn("event.stopPropagation();", app)
        self.assertIn("openRecordDatePicker(event.currentTarget)", app)
        self.assertIn("const MAX_WEEK_OFFSET = 9", app)
        self.assertIn("function startOfWeek", app)
        self.assertIn("function renderChampionshipCountdown", app)
        self.assertIn("eventCount.textContent = `${displayEvents.length}件`;", app)
        self.assertIn("currentEvents = displayEvents.filter(isRecordLinkedEvent);", app)
        self.assertNotIn("function renderEventCountdown", app)
        app_data = (ROOT / "app-data.js").read_text(encoding="utf-8")
        ui_utils = (ROOT / "ui-utils.js").read_text(encoding="utf-8")
        records = (ROOT / "records.js").read_text(encoding="utf-8")
        record = (ROOT / "record.js").read_text(encoding="utf-8")

        self.assertIn("window.AppData", app_data)
        self.assertIn("const EVENT_DATA_PATHS = ['./data/events.json', './data/store-events.json'];", app_data)
        self.assertIn("function eventCoversDate", app_data)
        self.assertIn("function isRecordLinkedEvent", app_data)
        self.assertIn("event.showEachDay", app_data)
        self.assertIn("event?.recordLink !== false", app_data)
        self.assertIn("function bindTimePlaceholders", ui_utils)
        self.assertIn("function syncTimePlaceholders", ui_utils)
        self.assertIn("function displayEventTitle", ui_utils)
        self.assertIn("return `対 ${away}`;", ui_utils)
        self.assertIn("return `対 ${home}`;", ui_utils)
        self.assertIn("displayEventTitle", records)
        self.assertIn("displayEventTitle", record)
        self.assertIn("displayEventTitle(item.title)", record)
        self.assertIn("displayEventTitle(eventMap.get(event.id)?.title || event.title)", records)
        self.assertIn("イベントと紐づけて保存します", app)
        self.assertNotIn("今日の注目イベントと紐づけて保存します", app)
        self.assertNotIn("document.querySelectorAll('.time-input-wrap input", app)
        self.assertNotIn("await loadEventData()", app)
        self.assertIn('id="calendar-today"', index)
        self.assertNotIn('id="today-button"', index)
        self.assertIn("'ゴールデンウィーク': 'G.W'", app)
        self.assertIn("'一般的なお盆休み期間': 'お盆'", app)
        self.assertIn('class="empty-state event-empty-state"', app)
        self.assertIn("const recordsPerPage = 10", (ROOT / "records.js").read_text(encoding="utf-8"))
        self.assertIn(".calendar-badge.title-badge", styles)
        self.assertIn("--record-side-size: 40px;", styles)
        self.assertIn("--status-pill-size: 58px;", styles)
        self.assertIn(".detail-shell .page-intro h2, .records-shell .page-intro h2 { font-size: 24px; }", styles)
        self.assertIn(".count-pill { display: inline-flex; min-width: var(--status-pill-size);", styles)
        self.assertIn(".event-title-date-button { min-height: 36px;", styles)
        self.assertIn("color: rgb(40, 76, 57);", styles)
        self.assertIn(".calendar-today-button { display: inline-flex;", styles)
        self.assertIn(".date-picker-button { display: inline-flex; min-width: 190px;", styles)
        self.assertIn("background: white; color: var(--muted);", styles)
        self.assertIn("justify-content: center;", styles)
        self.assertIn(".calendar-popover.is-floating { position: fixed;", styles)
        self.assertIn(".event-card.calendar-event-card", styles)
        self.assertNotIn(".week-event.calendar-week-event { border-left:", styles)
        self.assertIn(".week-nav { display: grid; grid-template-columns: 46px minmax(0, 1fr) 46px; width: 100%; height: 38px;", styles)
        self.assertIn("transform: translateY(-2px);", styles)
        self.assertIn(".week-row { display: grid; grid-template-columns: 96px minmax(0, 1fr);", styles)
        self.assertIn(".week-date strong { width: 96px; padding-right: 16px;", styles)
        self.assertIn("font-weight: 600;", styles)
        self.assertIn("justify-self: center;", styles)
        self.assertIn(".record-list-head .count-pill { width: var(--record-side-size);", styles)
        self.assertIn(".site-nav { position: fixed !important; top: 0; right: 0; bottom: 0;", styles)
        self.assertIn(".site-nav > #nav-auth-button { margin-top: 0; }", styles)
        self.assertIn(".record-list-item > .delete-icon-button { position: absolute; right: 15px; bottom: 15px; width: var(--record-side-size); height: var(--record-side-size);", styles)

    def test_store_events_are_available_for_record_linking(self):
        store_events = json.loads((ROOT / "data" / "store-events.json").read_text(encoding="utf-8"))
        by_title = {event["title"]: event for event in store_events}
        self.assertEqual(set(by_title), {
            "MORE PRICE DOWN 打ち出し",
            "ORCIVAL 打ち出し",
            "館 SUPER OUTLET SALE",
            "営業時間延長",
            "棚卸",
        })
        self.assertEqual(by_title["MORE PRICE DOWN 打ち出し"]["startAt"][:10], "2026-07-03")
        self.assertEqual(by_title["MORE PRICE DOWN 打ち出し"]["endAt"][:10], "2026-07-12")
        self.assertEqual(by_title["ORCIVAL 打ち出し"]["startAt"][:10], "2026-07-17")
        self.assertEqual(by_title["ORCIVAL 打ち出し"]["endAt"][:10], "2026-07-26")
        self.assertEqual(by_title["館 SUPER OUTLET SALE"]["startAt"][:10], "2026-07-17")
        self.assertEqual(by_title["館 SUPER OUTLET SALE"]["endAt"][:10], "2026-07-28")
        self.assertEqual(by_title["営業時間延長"]["startAt"][:10], "2026-07-19")
        self.assertEqual(by_title["棚卸"].get("recordLink"), False)
        for event in store_events:
            self.assertTrue(event.get("id"))
            self.assertTrue(event.get("startAt"))
            self.assertTrue(event.get("endAt"))
            self.assertTrue(event.get("predictedWindows"))
            self.assertNotIn("calendarContextEvent", event)


if __name__ == "__main__":
    unittest.main()
