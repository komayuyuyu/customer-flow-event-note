# 運用メモ

このリポジトリを「イベント情報・集客記録」Webアプリの正本とする。

## 公開URL

https://komayuyuyu.github.io/customer-flow-event-note/

## アプリが参照するデータ

- 注目イベント: `data/events.json`
- 祝日・大型連休: `data/calendar-context.json`
- 勤務後の集客記録: Firebase Authentication + Cloud Firestore

## イベント情報の更新手順

1. 調査した候補を `data/candidates.json` に書く。
2. 影響度を計算して `data/events.json` へマージする。

   ```powershell
   python scripts/evaluate_candidates.py
   ```

3. テストする。

   ```powershell
   python -m unittest discover -s tests -p "test_*.py"
   node --check app.js
   node --check records.js
   node --check record.js
   node --check records-backend.js
   node --check menu.js
   node --check ui-utils.js
   ```

4. `app.js` / `styles.css` / HTML / Service Workerを変更した場合は、静的資産の更新番号と `sw.js` のキャッシュ名を変更する。
5. GitHubへpushし、GitHub Pagesのデプロイ成功を確認する。
6. 公開HTMLに新しい更新番号またはデータ変更が反映されていることを確認する。

## Firebase

- `firebase-config.js` は公開アプリが使うFirebase設定を含む。
- APIキーはFirebase Webアプリ用の公開設定であり、秘密鍵ではない。
- Firestoreルールのテンプレートは `firebase/firestore.rules` に置く。
- 実デプロイ時は `__ALLOWED_UID__` を所有者UIDへ置換したルールをFirebaseへ反映する。

## 公開してはいけないもの

- 個人のログ、実作業メモ
- Firebaseの秘密鍵やサービスアカウント
- ローカルだけで使う検証サーバー
- 実運用に使わない古い計画書
