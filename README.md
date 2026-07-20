# イベント情報

全国的な注目イベント、兵庫・大阪・京都・東京を中心にした広域人流イベント、垂水駅周辺の近距離イベント、祝日・大型連休を確認し、勤務後の集客状況を記録するWebアプリ。

## 構成

- 静的Webアプリ: GitHub Pages
- 記録保存: Firebase Authentication + Cloud Firestore
- イベント予定: `data/events.json`
- 勤務カレンダー由来の店頭・館イベント: `data/store-events.json`
- 祝日・大型連休: `data/calendar-context.json`
- 表示範囲: トップ画面の週間予定から9週先まで
- 週1回の広めチェック: 毎週日曜日の夜に、実行日から60日先までのイベント候補を確認
- 神戸市内の固定確認: 海神社の夏祭りを含む垂水駅周辺の地域イベント、湊川神社の祭典・行事

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
- `data/store-events.json`: 勤務カレンダーから入れる店頭施策・館イベント
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
