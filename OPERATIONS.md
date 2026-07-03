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
   - 通常の全国的な注目イベントに加えて、兵庫・大阪・京都・東京の花火、ルミナリエ、祭り、優勝パレード級の広域人流イベントを確認する。
   - 祭りは、関西以外でも日本全国の誰もが知っている規模なら収集対象に含める。
   - 東京など遠方の現地イベントは、神戸の勤務先への直接影響を過大評価しない。テレビ放送や全国的な話題化で影響が見込める時だけ `影響 大` にする。
   - ヴィッセル神戸が優勝争いに入った時は、直近試合を候補化し、`championship` に「あと何勝で優勝」「優勝条件」「2位以下の逆転条件」を入れる。
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

## 表示期間

- トップの週間予定は、記録日を起点に7日単位で表示する。
- 矢印で今週から9週先まで確認できる。
- 更新頻度は従来どおり、毎朝チェックと週1回の広めチェックを維持する。

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
