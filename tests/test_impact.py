import unittest

from impact import calculate_impact


def high_event(start_at: str, end_at: str):
    return {
        "id": "test-event",
        "title": "大型イベント",
        "startAt": start_at,
        "endAt": end_at,
        "nationalReach": 3,
        "liveUrgency": 3,
        "accessibility": 3,
        "buzz": 3,
        "significance": 3,
        "officialConfirmed": True,
        "sources": [{"url": "https://example.com/official"}, {"url": "https://example.com/news"}],
    }


class ImpactTest(unittest.TestCase):
    def test_21_oclock_event_keeps_preparation_window(self):
        result = calculate_impact(high_event("2026-07-05T21:00:00+09:00", "2026-07-05T23:00:00+09:00"))
        self.assertEqual(result["impactLevel"], "大")
        prep = result["predictedWindows"][0]
        self.assertEqual(prep["start"], "18:00")
        self.assertEqual(prep["end"], "21:00")

    def test_overnight_event_creates_next_day_window(self):
        result = calculate_impact(high_event("2026-07-06T02:00:00+09:00", "2026-07-06T04:30:00+09:00"))
        labels = {window["label"] for window in result["predictedWindows"]}
        self.assertIn("深夜視聴の翌日", labels)
        recovery = next(window for window in result["predictedWindows"] if window["label"] == "深夜視聴の翌日")
        self.assertEqual(recovery["date"], "2026-07-06")
        self.assertEqual(recovery["start"], "10:00")

    def test_outside_business_hours_is_not_filtered(self):
        result = calculate_impact(high_event("2026-07-07T23:30:00+09:00", "2026-07-08T02:00:00+09:00"))
        self.assertGreaterEqual(len(result["predictedWindows"]), 3)

    def test_early_morning_event_creates_same_day_recovery_window(self):
        result = calculate_impact(high_event("2026-07-06T05:00:00+09:00", "2026-07-06T07:30:00+09:00"))
        labels = {window["label"] for window in result["predictedWindows"]}
        self.assertIn("深夜視聴の翌日", labels)


if __name__ == "__main__":
    unittest.main()
