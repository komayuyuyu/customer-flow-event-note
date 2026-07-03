from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo


TOKYO = ZoneInfo("Asia/Tokyo")


def _bounded(value: Any, minimum: int = 0, maximum: int = 3) -> int:
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return minimum


def calculate_impact(candidate: dict[str, Any]) -> dict[str, Any]:
    """イベント候補から影響度・確からしさ・影響時間帯を算出する。"""
    reach = _bounded(candidate.get("nationalReach"))
    live = _bounded(candidate.get("liveUrgency"))
    access = _bounded(candidate.get("accessibility"))
    buzz = _bounded(candidate.get("buzz"))
    significance = _bounded(candidate.get("significance"))

    score = reach * 2 + live * 2 + access + buzz + significance * 2
    if score >= 18:
        level = "大"
    elif score >= 11:
        level = "中"
    else:
        level = "小"
    if candidate.get("impactLevelOverride") in {"大", "中", "小"}:
        level = candidate["impactLevelOverride"]

    source_count = len(candidate.get("sources") or [])
    if candidate.get("officialConfirmed") and source_count >= 2:
        confidence = "高"
    elif candidate.get("officialConfirmed") or source_count >= 2:
        confidence = "中"
    else:
        confidence = "低"

    start = _parse_datetime(candidate["startAt"])
    end = _parse_datetime(candidate.get("endAt")) if candidate.get("endAt") else start + timedelta(hours=2)

    return {
        **candidate,
        "impactScore": score,
        "impactLevel": level,
        "confidence": confidence,
        "predictedWindows": _impact_windows(start, end, level, _event_mode(candidate)),
    }


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TOKYO)
    return parsed.astimezone(TOKYO)


def _window(label: str, start: datetime, end: datetime, reason: str) -> dict[str, str]:
    return {
        "label": label,
        "date": start.date().isoformat(),
        "start": start.strftime("%H:%M"),
        "end": end.strftime("%H:%M"),
        "reason": reason,
    }


def _event_mode(candidate: dict[str, Any]) -> str:
    if candidate.get("inPersonEvent"):
        return "in_person"
    category = str(candidate.get("category") or "")
    if any(keyword in category for keyword in ("花火", "祭り", "パレード", "イルミネーション", "ルミナリエ")):
        return "in_person"
    return "broadcast"


def _impact_windows(start: datetime, end: datetime, level: str, mode: str = "broadcast") -> list[dict[str, str]]:
    windows: list[dict[str, str]] = []

    if mode == "in_person":
        lead_hours = 4 if level == "大" else 3
        arrival_start = start - timedelta(hours=lead_hours)
        windows.append(
            _window(
                "来場・交通混雑",
                arrival_start,
                start,
                "会場周辺への移動、駅や道路の混雑、待ち合わせで広域の人流が変わる可能性",
            )
        )
        windows.append(
            _window(
                "イベント開催中",
                start,
                end,
                "現地滞在や周辺回遊により、通常の買い物動線が変わる可能性",
            )
        )
        windows.append(
            _window(
                "終了後の帰宅混雑",
                end,
                end + timedelta(hours=2),
                "終了後の一斉移動で交通機関と繁華街の混雑が変わる可能性",
            )
        )
        return windows

    if start.hour >= 20:
        lead_hours = 3 if level == "大" else 2
    elif start.hour >= 17:
        lead_hours = 2 if level in {"大", "中"} else 1
    else:
        lead_hours = 1

    prep_start = start - timedelta(hours=lead_hours)
    windows.append(
        _window(
            "視聴準備・早めの帰宅",
            prep_start,
            start,
            "食事や飲み物の購入、帰宅、視聴準備で街から人が引く可能性",
        )
    )

    windows.append(
        _window(
            "リアルタイム視聴",
            start,
            end,
            "生中継・ライブ配信をその時間に見る人が増える可能性",
        )
    )

    if end.hour < 7 or start.hour < 7 or end.date() > start.date():
        recovery_date = end.date()
        recovery_start = datetime.combine(recovery_date, datetime.min.time(), TOKYO).replace(hour=10)
        recovery_end = recovery_start.replace(hour=14)
        windows.append(
            _window(
                "深夜視聴の翌日",
                recovery_start,
                recovery_end,
                "睡眠不足や外出開始の遅れで午前から昼の客足が落ちる可能性",
            )
        )

    return windows
