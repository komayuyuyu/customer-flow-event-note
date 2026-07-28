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
    def test_21_oclock_event_keeps_realtime_window_without_redundant_reason(self):
        result = calculate_impact(high_event("2026-07-05T21:00:00+09:00", "2026-07-05T23:00:00+09:00"))
        self.assertEqual(result["impactLevel"], "大")
        realtime = result["predictedWindows"][0]
        self.assertEqual(realtime["label"], "リアルタイム視聴")
        self.assertEqual(realtime["start"], "21:00")
        self.assertEqual(realtime["end"], "23:00")
        self.assertNotIn("reason", realtime)
        self.assertNotIn("視聴準備・早めの帰宅", {window["label"] for window in result["predictedWindows"]})

    def test_overnight_event_creates_next_day_window(self):
        result = calculate_impact(high_event("2026-07-06T02:00:00+09:00", "2026-07-06T04:30:00+09:00"))
        labels = {window["label"] for window in result["predictedWindows"]}
        self.assertIn("深夜視聴の翌日", labels)
        recovery = next(window for window in result["predictedWindows"] if window["label"] == "深夜視聴の翌日")
        self.assertEqual(recovery["date"], "2026-07-06")
        self.assertEqual(recovery["start"], "10:00")

    def test_outside_business_hours_is_not_filtered(self):
        result = calculate_impact(high_event("2026-07-07T23:30:00+09:00", "2026-07-08T02:00:00+09:00"))
        self.assertGreaterEqual(len(result["predictedWindows"]), 2)

    def test_early_morning_event_creates_same_day_recovery_window(self):
        result = calculate_impact(high_event("2026-07-06T05:00:00+09:00", "2026-07-06T07:30:00+09:00"))
        labels = {window["label"] for window in result["predictedWindows"]}
        self.assertIn("深夜視聴の翌日", labels)

    def test_in_person_event_creates_traffic_windows(self):
        candidate = high_event("2026-07-25T19:00:00+09:00", "2026-07-25T20:30:00+09:00")
        candidate["category"] = "花火"
        result = calculate_impact(candidate)
        labels = [window["label"] for window in result["predictedWindows"]]
        self.assertEqual(labels, ["来場・交通混雑", "イベント開催中", "終了後の帰宅混雑"])
        self.assertEqual(result["predictedWindows"][0]["start"], "15:00")

    def test_impact_level_override_adjusts_shop_relevance(self):
        candidate = high_event("2026-08-08T19:30:00+09:00", "2026-08-08T20:30:00+09:00")
        candidate["category"] = "花火"
        candidate["area"] = "東京"
        candidate["impactLevelOverride"] = "小"
        result = calculate_impact(candidate)
        self.assertEqual(result["impactLevel"], "小")


if __name__ == "__main__":
    unittest.main()
