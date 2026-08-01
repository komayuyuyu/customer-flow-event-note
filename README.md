# イベント情報

全国的な注目イベント、兵庫・大阪・京都・東京を中心にした広域人流イベント、垂水駅周辺の近距離イベント、祝日・大型連休を確認し、勤務後の集客状況を記録するWebアプリ。

## 構成

- 静的Webアプリ: Firebase Hosting
- 記録保存: Firebase Authentication + Cloud Firestore + App Check
- イベント予定: `data/events.json`
- 勤務カレンダー由来の店頭・館イベント: `data/store-events.json`
- 祝日・大型連休: `data/calendar-context.json`
- 表示範囲: トップ画面の週間予定から9週先まで
- 週1回の広めチェック: 毎週日曜日の夜に、実行日から60日先までのイベント候補を確認
- 花火の固定確認: 公式巡回表を使い、毎朝は兵庫・大阪の3日分、週次は兵庫・大阪・京都・東京の60日分を日付別に確認
- 神戸市内の固定確認: 海神社の夏祭りを含む垂水駅周辺の地域イベント、湊川神社の祭典・行事
- ブランド関連の固定確認: ビショップ音楽祭
- 複数日イベント: 開始日から終了日までの全開催日に表示

## 公開URL

https://customer-flow-event-note.web.app/

旧GitHub Pages URLは上記URLへの案内ページとして残す。

## 主なファイル

- `index.html`: ホーム、今日の注目イベント、1週間の予定、集客記録フォーム
- `records.html`: 記録一覧
- `record.html`: 記録詳細
- `404.html`: 存在しないURLの案内
- `app.js`: ホーム画面と記録保存
- `app-date-picker.js`: 記録日のカレンダー表示と選択操作
- `app-view.js`: イベントカードと週間予定の表示生成
- `app-backend.js`: ホーム画面のデータ取得・記録保存
- `record-store.js`: Firestore上の記録取得・一覧・保存・削除の共通処理
- `firebase-client.js`: Firebase SDK・Google認証の共通初期化
- `firebase.json`: Firebase Hostingの公開範囲とセキュリティヘッダー
- `.firebaserc`: 公開先Firebaseプロジェクト
- `firebase/firestore.rules`: 所有者・項目・型・文字数を検証するFirestoreルールテンプレート
- `.github/workflows/codeql.yml`: JavaScriptの継続的なセキュリティスキャン
- `.github/workflows/quality.yml`: Pythonテスト・JavaScript構文・JSON構文の自動検査
- `records.js`: 記録一覧
- `record.js`: 記録詳細・編集
- `records-backend.js`: Firebase/ローカル互換の記録処理
- `data/events.json`: 表示するイベント情報
- `data/store-events.json`: 勤務カレンダーから入れる店頭施策・館イベント
- `data/calendar-context.json`: 祝日・大型連休
- `scripts/evaluate_candidates.py`: 候補イベントの影響度計算とマージ
- `scripts/check_project_contracts.py`: 読込順・保守性・アクセシビリティ契約の検査
- `impact.py`: 影響度計算ロジック
- `OPERATIONS.md`: 更新・保守手順
- `CODEMAP.md`: ファイルごとの責務と更新時の確認先

## イベント情報の更新

詳しくは `OPERATIONS.md` と `event-data-format.md` を参照。

基本手順:

```powershell
python scripts/evaluate_candidates.py
python -m unittest discover -s tests -p "test_*.py"
```

ローカル表示確認とFirestoreのバックアップ・復旧は `OPERATIONS.md` の手順に従う。

## 注意

このリポジトリを公開Webアプリの正本として扱う。ローカル検証サーバーや古い開発用メモは含めない。
