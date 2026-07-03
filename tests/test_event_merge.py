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


if __name__ == "__main__":
    unittest.main()
