import unittest

from scripts.evaluate_candidates import merge_events


class EventMergeTest(unittest.TestCase):
    def test_existing_past_event_is_preserved(self):
        past = {"id": "past-event", "title": "過去イベント", "startAt": "2026-06-30T02:00:00+09:00"}
        new = {
            "id": "new-event",
            "title": "新規イベント",
            "startAt": "2026-07-01T18:30:00+09:00",
            "nationalReach": 1,
            "liveUrgency": 1,
            "accessibility": 1,
            "buzz": 1,
            "significance": 1,
            "officialConfirmed": True,
            "sources": [],
        }

        merged = merge_events([past], [new])

        self.assertEqual([item["id"] for item in merged], ["past-event", "new-event"])

    def test_existing_event_loses_obvious_traffic_windows(self):
        existing = {
            "id": "existing-event",
            "title": "既存イベント",
            "startAt": "2026-08-08T19:30:00+09:00",
            "predictedWindows": [
                {"label": "視聴準備・早めの帰宅", "reason": "帰宅して準備する可能性"},
                {"label": "リアルタイム視聴", "start": "18:00", "end": "19:00", "reason": "中継を見る可能性"},
                {"label": "来場・交通混雑", "reason": "駅や道路が混雑する可能性"},
                {"label": "イベント開催中", "start": "19:30", "end": "20:30", "reason": "現地に滞在する可能性"},
                {"label": "終了後の帰宅混雑", "reason": "終了後に帰宅する可能性"},
                {"label": "深夜視聴の翌日", "start": "10:00", "end": "14:00", "reason": "睡眠不足になる可能性"},
            ],
        }

        merged = merge_events([existing], [])

        self.assertEqual(
            merged[0]["predictedWindows"],
            [
                {"label": "リアルタイム視聴", "start": "18:00", "end": "19:00"},
                {"label": "イベント開催中", "start": "19:30", "end": "20:30"},
                {"label": "深夜視聴の翌日", "start": "10:00", "end": "14:00"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
