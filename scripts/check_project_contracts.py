import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = ("index.html", "records.html", "record.html", "404.html")
PROVIDERS = {
    "AppBackend": "app-backend.js",
    "AppData": "app-data.js",
    "AppDatePicker": "app-date-picker.js",
    "AppView": "app-view.js",
    "CUSTOMER_FLOW_FIREBASE_CONFIG": "firebase-config.js",
    "FirebaseClient": "firebase-client.js",
    "RecordsBackend": "records-backend.js",
    "RecordStore": "record-store.js",
    "UiUtils": "ui-utils.js",
}
BUILTIN_WINDOW_NAMES = {"addEventListener", "innerHeight", "innerWidth"}


def script_order(html: str) -> list[str]:
    return [source.split("?", 1)[0].removeprefix("./") for source in re.findall(r'<script[^>]+src="([^"]+)"', html)]


def check_script_dependencies() -> None:
    for html_name in HTML_FILES:
        scripts = script_order((ROOT / html_name).read_text(encoding="utf-8"))
        positions = {name: index for index, name in enumerate(scripts)}
        for script_name in scripts:
            source = (ROOT / script_name).read_text(encoding="utf-8")
            used_names = set(re.findall(r"window\.([A-Za-z_][A-Za-z0-9_]*)", source)) - BUILTIN_WINDOW_NAMES
            for name in used_names:
                provider = PROVIDERS.get(name)
                if not provider or provider == script_name:
                    continue
                if provider not in positions:
                    raise AssertionError(f"{html_name}: {script_name} requires missing {provider} ({name})")
                if positions[provider] >= positions[script_name]:
                    raise AssertionError(f"{html_name}: {provider} must load before {script_name} ({name})")


def relative_luminance(color: str) -> float:
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    lighter, darker = sorted((relative_luminance(foreground), relative_luminance(background)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def check_accessibility_contracts() -> None:
    record = (ROOT / "record.js").read_text(encoding="utf-8")
    for control_id in ("traffic", "weather", "impact", "accuracy", "note"):
        if f'for="{control_id}"' not in record:
            raise AssertionError(f"record.js: label is not associated with #{control_id}")
    for script_name in ("app.js", "records.js", "record.js"):
        if "createModalController" not in (ROOT / script_name).read_text(encoding="utf-8"):
            raise AssertionError(f"{script_name}: modal focus controller is missing")

    styles = (ROOT / "styles.css").read_text(encoding="utf-8")
    variables = dict(re.findall(r"--([a-z-]+):\s*(#[0-9a-fA-F]{6});", styles))
    for name in ("muted", "orange"):
        for background in ("#f3f0e8", "#fffdf8", "#ffffff"):
            ratio = contrast_ratio(variables[name], background)
            if ratio < 4.5:
                raise AssertionError(f"--{name} contrast is {ratio:.2f}:1 on {background}")


def check_removed_legacy_apis() -> None:
    app_backend = (ROOT / "app-backend.js").read_text(encoding="utf-8")
    if "listObservations" in app_backend:
        raise AssertionError("app-backend.js: unused listObservations API must not return")


if __name__ == "__main__":
    check_script_dependencies()
    check_accessibility_contracts()
    check_removed_legacy_apis()
    print("Project contracts OK")
