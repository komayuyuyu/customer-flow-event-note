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
            self.assertIn("ui-utils.js?v=20260703-17", html)

        service_worker = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("const VERSION = '20260703-17';", service_worker)
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
        self.assertIn("'ゴールデンウィーク': 'G.W'", app)
        self.assertIn('class="empty-state event-empty-state"', app)
        self.assertIn("const recordsPerPage = 10", (ROOT / "records.js").read_text(encoding="utf-8"))
        self.assertIn(".calendar-badge.title-badge", styles)


if __name__ == "__main__":
    unittest.main()
