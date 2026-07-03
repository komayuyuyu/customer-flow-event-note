from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from impact import calculate_impact  # noqa: E402


CANDIDATES = PROJECT_ROOT / "data" / "candidates.json"
EVENTS = PROJECT_ROOT / "data" / "events.json"


def event_id(candidate: dict) -> str:
    existing = candidate.get("id")
    if existing:
        return str(existing)
    base = f"{candidate.get('title', '')}|{candidate.get('startAt', '')}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:16]


def merge_events(existing_events: list[dict], candidates: list[dict]) -> list[dict]:
    events_by_id = {
        str(item["id"]): item
        for item in existing_events
        if item.get("id")
    }
    for candidate in candidates:
        required = {"title", "startAt"}
        if not required.issubset(candidate):
            continue
        candidate["id"] = event_id(candidate)
        events_by_id[candidate["id"]] = calculate_impact(candidate)
    evaluated = list(events_by_id.values())
    evaluated.sort(key=lambda item: item.get("startAt", ""))
    return evaluated


def main() -> None:
    candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    existing_events = json.loads(EVENTS.read_text(encoding="utf-8")) if EVENTS.exists() else []
    evaluated = merge_events(existing_events, candidates)
    EVENTS.write_text(json.dumps(evaluated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(evaluated)}件を評価しました")


if __name__ == "__main__":
    main()
