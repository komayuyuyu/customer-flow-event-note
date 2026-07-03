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
            "data/calendar-context.json",
        ):
            self.assertTrue((ROOT / name).is_file(), name)

    def test_static_asset_version_is_consistent(self):
        for name in ("index.html", "records.html", "record.html"):
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn("styles.css?v=20260703-22", html)
            self.assertIn("ui-utils.js?v=20260703-22", html)
            self.assertIn("app-data.js?v=20260703-22", html)
            self.assertIn("IVENT INFO＆CUSTOMER NOTE", html)

        service_worker = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("const VERSION = '20260703-22';", service_worker)
        self.assertIn("app-data.js?v=${VERSION}", service_worker)
        self.assertIn("ui-utils.js?v=${VERSION}", service_worker)

    def test_event_update_tooling_is_present(self):
        self.assertTrue((ROOT / "impact.py").is_file())
        self.assertTrue((ROOT / "scripts" / "evaluate_candidates.py").is_file())
        self.assertTrue((ROOT / "data" / "candidates.json").is_file())
        candidates = json.loads((ROOT / "data" / "candidates.json").read_text(encoding="utf-8"))
        self.assertIsInstance(candidates, list)

    def test_core_ui_contracts(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn("function renderTodayEventCard", app)
        self.assertIn("function renderWeekEvent", app)
        app_data = (ROOT / "app-data.js").read_text(encoding="utf-8")
        ui_utils = (ROOT / "ui-utils.js").read_text(encoding="utf-8")

        self.assertIn("window.AppData", app_data)
        self.assertIn("function bindTimePlaceholders", ui_utils)
        self.assertIn("function syncTimePlaceholders", ui_utils)
        self.assertNotIn("document.querySelectorAll('.time-input-wrap input", app)
        self.assertNotIn("await loadEventData()", app)
        self.assertIn("'ゴールデンウィーク': 'G.W'", app)
        self.assertIn('class="empty-state event-empty-state"', app)
        self.assertIn("const recordsPerPage = 10", (ROOT / "records.js").read_text(encoding="utf-8"))
        self.assertIn(".calendar-badge.title-badge", styles)
        self.assertIn("--record-side-size: 40px;", styles)
        self.assertIn("--status-pill-size: 58px;", styles)
        self.assertIn(".detail-shell .page-intro h2, .records-shell .page-intro h2 { font-size: 24px; }", styles)
        self.assertIn(".count-pill { display: inline-flex; min-width: var(--status-pill-size);", styles)
        self.assertIn(".record-list-head .count-pill { width: var(--record-side-size);", styles)
        self.assertIn(".site-nav { position: fixed !important; top: 0; right: 0; bottom: 0;", styles)
        self.assertIn(".site-nav > #nav-auth-button { margin-top: 0; }", styles)
        self.assertIn(".record-list-item > .delete-icon-button { position: absolute; right: 15px; bottom: 15px; width: var(--record-side-size); height: var(--record-side-size);", styles)


if __name__ == "__main__":
    unittest.main()
