# 保守マップ

画面の見た目と利用者向けの挙動を保ったまま更新するための、ファイルごとの責務一覧です。

## 画面

- `index.html` / `app.js`: ホーム画面。イベント表示、週送り、記録フォームのUIだけを扱う。
- `records.html` / `records.js`: 記録一覧。
- `record.html` / `record.js`: 記録詳細と編集。
- `styles.css`: 3画面共通の見た目。
- `menu.js`: 共通メニュー。

## 共通処理

- `app-data.js`: イベント・祝日データの読み込み、日付計算、旧記録の補完。
- `app-backend.js`: ホーム画面のFirebase認証、Firestore保存、ローカル互換API。
- `records-backend.js`: 記録一覧・詳細画面の認証と記録CRUD。
- `ui-utils.js`: HTMLエスケープ、表示名、フォーム選択肢などの小さな共通部品。

## データと更新

- `data/candidates.json`: 調査直後の候補。
- `data/events.json`: 表示するイベントの正本。
- `data/store-events.json`: 店頭・館イベントの正本。
- `data/calendar-context.json`: 祝日・大型連休。
- `scripts/evaluate_candidates.py`: 候補を評価して `events.json` へ反映。

更新手順は [OPERATIONS.md](OPERATIONS.md) を参照します。画面を変えない整理では、まず `node --check` とPythonテストを実行し、次にPC・スマホ幅でホーム／一覧／詳細を確認します。
