# 保守マップ

画面の見た目と利用者向けの挙動を保ったまま更新するための、ファイルごとの責務一覧です。

## 画面

- `index.html` / `app.js`: ホーム画面の状態管理、週送り、記録フォームの操作を扱う。
- `app-date-picker.js`: 記録日のカレンダー表示、選択、配置、見出し更新を扱う。
- `app-view.js`: ホーム画面のイベントカードと週間予定のHTML生成を扱う。
- `records.html` / `records.js`: 記録一覧。
- `record.html` / `record.js`: 記録詳細と編集。
- `404.html`: Firebase Hostingで存在しないURLを開いた時の案内。
- `styles.css`: 3画面共通の見た目。
- `menu.js`: 共通メニュー。

## 共通処理

- `app-data.js`: イベント・祝日データの読み込み、日付計算、記録内配列の正規化、旧記録の補完。
- `record-store.js`: Firestore上の記録取得・一覧・保存・削除を3画面共通で扱う。
- `firebase-client.js`: Firebase SDKの読み込みと共通のGoogle認証初期化。
- `app-backend.js`: ホーム画面のFirestore読込・保存境界とローカル互換API。
- `records-backend.js`: 記録一覧・詳細画面の読込・保存境界と記録CRUD。
- `ui-utils.js`: HTMLエスケープ、表示名、フォーム選択肢などの小さな共通部品。

## データと更新

- `data/candidates.json`: 調査直後の候補。
- `data/events.json`: 表示するイベントの正本。
- `data/store-events.json`: 店頭・館イベントの正本。
- `data/calendar-context.json`: 祝日・大型連休。
- `scripts/evaluate_candidates.py`: 候補を評価して `events.json` へ反映。
- `scripts/check_project_contracts.py`: スクリプト読込順、保守性、アクセシビリティ契約を検査するCI用処理。
- `hosting-public-files.json`: Firebase Hostingへ配信する静的ファイルの許可リスト。
- `scripts/build-hosting.mjs`: 許可リストから`.firebase-public/`へ公開成果物を生成。

更新手順は [OPERATIONS.md](OPERATIONS.md) を参照します。画面を変えない整理では、まず `node --check` とPythonテストを実行し、次にPC・スマホ幅でホーム／一覧／詳細を確認します。
