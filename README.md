# イベント情報・集客記録

全国的な注目イベントや祝日・大型連休を確認し、勤務後の集客状況を記録するWebアプリ。

## 構成

- 静的Webアプリ: GitHub Pages
- 記録保存: Firebase Authentication + Cloud Firestore
- イベント予定: `data/events.json`
- 祝日・大型連休: `data/calendar-context.json`

## 公開URL

https://komayuyuyu.github.io/customer-flow-event-note/

## 主なファイル

- `index.html`: ホーム、今日の注目イベント、1週間の予定、集客記録フォーム
- `records.html`: 記録一覧
- `record.html`: 記録詳細
- `app.js`: ホーム画面と記録保存
- `records.js`: 記録一覧
- `record.js`: 記録詳細・編集
- `records-backend.js`: Firebase/ローカル互換の記録処理
- `data/events.json`: 表示するイベント情報
- `data/calendar-context.json`: 祝日・大型連休
- `scripts/evaluate_candidates.py`: 候補イベントの影響度計算とマージ
- `impact.py`: 影響度計算ロジック
- `OPERATIONS.md`: 更新・保守手順

## イベント情報の更新

詳しくは `OPERATIONS.md` と `event-data-format.md` を参照。

基本手順:

```powershell
python scripts/evaluate_candidates.py
python -m unittest discover -s tests -p "test_*.py"
```

## 注意

このリポジトリを公開Webアプリの正本として扱う。ローカル検証サーバーや古い開発用メモは含めない。
