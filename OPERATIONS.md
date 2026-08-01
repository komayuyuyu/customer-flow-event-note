# 運用メモ

このリポジトリを「イベント情報」Webアプリの正本とする。

ローカル正本は `C:\obsidian\MyVault\30_Projects\customer-flow-event-note-public` とする。更新開始時に `git rev-parse --show-toplevel` で確認し、旧フォルダ `customer-flow-event-alert` では更新しない。

## 公開URL

https://komayuyuyu.github.io/customer-flow-event-note/

## アプリが参照するデータ

- 注目イベント: `data/events.json`
- 勤務カレンダー由来の店頭・館イベント: `data/store-events.json`
- 祝日・大型連休: `data/calendar-context.json`
- 勤務後の集客記録: Firebase Authentication + Cloud Firestore

## イベント情報の更新手順

1. 調査した候補を `data/candidates.json` に書く。
   - 画面に表示する `liveReason` / `trafficReason` は、閲覧者が判断に使える情報だけを端的に書く。「候補扱い」「過大評価しない」「表示上は」「集客記録では」など制作・運用側の説明は表示文へ入れない。
   - 制作・運用上だけ必要な判断理由は `internalNote` に分離する。`internalNote` は画面に表示しない。
   - タイトルを言い換えただけの説明や、見れば分かる定型説明文は表示しない。「視聴準備・早めの帰宅」「来場・交通混雑」「終了後の帰宅混雑」は時間帯ごと表示しない。残す予測時間帯はラベルと時刻だけにし、`predictedWindows[].reason` は使用しない。交通規制など固有情報は `trafficReason` にだけ端的に書く。
   - セールでは「来館数や客層、店頭の流れに影響する」といった共通認識を `trafficReason` に書かない。交通規制、通常と異なる営業時間、限定条件など固有の追加情報がある時だけ表示する。
   - 毎朝チェックは、当日・翌日・翌々日のイベントを日付ごとに確認し、直近の更新・中止・延期・放送変更も確認する。
   - 週1回の広めチェックは、毎週日曜日の夜に実行し、実行日を基準に当日から60日先までを対象にする。
   - 例: 2026-07-12（日）夜に週次チェックする場合、対象期間は2026-07-12〜2026-09-10。
   - 通常の全国的な注目イベントに加えて、兵庫・大阪・京都・東京の花火、ルミナリエ、祭り、優勝パレード級の広域人流イベントを確認する。
   - 花火は `data/event-source-registry.json` を固定巡回表とする。毎朝は兵庫・大阪について当日・翌日・翌々日を日付別に、週次は4地域について60日分を確認する。
   - 検索語は「花火」だけに限定せず、「花火大会」「打上花火」「納涼」「夏まつり」「サマーカーニバル」「夜市」「夢花火」「舞花火」も使う。
   - 各日付×地域について、主催者、自治体、観光協会の公式情報を最低1件確認する。該当イベントがない場合も確認済みとして扱い、未確認の日付×地域を残したまま更新完了にしない。
   - 前年と開催週が異なる場合があるため、前年の日付を流用せず、必ず当年の公式開催概要と交通規制を確認する。
   - 客足への直接影響が小さくても、年1回の球宴、代表戦、決勝、表彰・受賞、全国的な大型特番など、幅広い来店客との会話に使える話題イベントを確認する。全国地上波、無料配信、ファン投票、大手メディアでの継続報道のいずれかがあるものを優先する。
   - NPBオールスターゲームは毎年の固定確認対象にする。公式開催要項で両試合の日程・会場・開始時刻・放送予定を確認し、ホームランダービーを含めて各試合を個別に候補化する。
   - 垂水駅周辺など勤務先の近距離で行われる祭り・地域イベントは、知名度や規模にかかわらず直接影響の確認対象にする。特に海神社の夏祭りは毎年の固定確認対象とし、6月末から7月前半に公式サイトで日程・交通規制を確認する。
   - 海神社の夏祭りは、海の日を含む3日間を候補期間として確認する。近距離の人流・交通規制があるため、特段の反証がなければ影響度を `大` とする。
   - 湊川神社の祭典・行事等一覧を毎朝・週次チェックの固定巡回先にする。祭り、露店、神輿、夜間催事など来街者が増える行事は必ず候補化する。
   - 湊川神社の夏まつり（献燈祭・菊水天神祭）は毎年の固定確認対象とし、7月中に公式サイトで8月22日〜26日の詳細、開催時間、交通・駐車場案内を確認する。
   - 祭りは、関西以外でも日本全国の誰もが知っている規模なら収集対象に含める。
   - 東京など遠方の現地イベントは、神戸の勤務先への直接影響を過大評価しない。テレビ放送や全国的な話題化で影響が見込める時だけ `影響 大` にする。
   - ヴィッセル神戸が優勝争いに入った時は、直近試合を候補化し、`championship` に「あと何勝で優勝」「優勝条件」「2位以下の逆転条件」を入れる。
   - フジロックのような複数日イベントは `showEachDay: true` を付け、開始日から終了日までの全開催日に表示する。
   - ビショップ音楽祭は毎年の固定確認対象にする。Bshop公式サイトと音楽祭公式サイトを毎朝・週次チェックで巡回し、開催発表後は日程・会場・開演時刻・出演者・交通案内を候補へ反映する。
2. 影響度を計算して `data/events.json` へマージする。

   ```powershell
   python scripts/evaluate_candidates.py
   ```

客足注意イベントは、Webアプリの `data/events.json` / `data/store-events.json` を正本とし、Google Calendarには登録しない。初期運用で使っていた `[客足注意]` のGoogle Calendar通知は廃止済み。

勤務カレンダー画像から拾った店頭施策・館イベントは `data/store-events.json` に追加する。下部メモや通常MTではなく、カレンダーの「イベント関連」欄にある予定だけを入れる。

勤務カレンダーは出典であり、閲覧者向けの放送・配信情報ではないため `broadcast` に入れない。「勤務カレンダーのイベント関連欄に記載」といった出典説明も表示文に入れず、必要な場合は `sources` または `internalNote` に保持する。

勤務カレンダーから店内イベントを吸い出す時は、反映前に必ずチャットでイベント名と期間の一覧を提示し、ユーザー確認を受ける。提示前には以下を確認する。

- 長期イベントは、帯の左端と右端が乗っている日付セルをそれぞれ確認する。
- 単日イベントは、表示されている日付セルと下部メモ欄を混同していないか確認する。
- `イベントとして表示するが通常日扱い` の予定は `recordLink: false` を付け、保存時の関連イベントには入れない。
- `イベント情報に掲載不要` とされた予定は `data/store-events.json` に入れない。

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

   Pull Request作成時と`main`へのpush時は、GitHub Actionsの`Quality Checks`がPythonテスト、ルート直下の全JavaScript、`data/*.json`を自動検査する。このワークフローは読み取り専用で、デプロイや自動コミットは行わない。

4. `app.js` / `styles.css` / HTML / Service Workerを変更した場合は、静的資産の更新番号と `sw.js` のキャッシュ名を変更する。
5. GitHubへpushし、GitHub Pagesのデプロイ成功を確認する。
6. 公開HTMLに新しい更新番号またはデータ変更が反映されていることを確認する。

## 表示期間

- トップの週間予定は、記録日を起点に7日単位で表示する。
- 矢印で今週から9週先まで確認できる。
- 更新頻度は従来どおり、毎朝チェックと週1回の広めチェックを維持する。
- 週1回の広めチェックは毎週日曜日の夜に行い、実行日から60日先までのイベント候補を確認する。

## Firebase

- `firebase-config.js` は公開アプリが使うFirebase設定を含む。
- APIキーはFirebase Webアプリ用の公開設定であり、秘密鍵ではない。
- APIキーはGoogle Cloud Consoleで、Firebase関連APIと次のHTTPリファラーだけに制限する。
  - `https://komayuyuyu.github.io/*`
  - `https://komayuyuyu.github.io/customer-flow-event-note/*`
  - `https://customer-flow-event-note.firebaseapp.com/*`
  - `https://customer-flow-event-note.web.app/*`
  - `http://localhost:8000/*`
  - `http://127.0.0.1:8000/*`
- Firebase Authenticationのリクエストではパスを含まないGitHub Pagesのオリジンがリファラーとして送られるため、`https://komayuyuyu.github.io/*` を削除しない。
- Firestoreルールのテンプレートは `firebase/firestore.rules` に置く。
- 実デプロイ時は `__ALLOWED_UID__` を所有者UIDへ置換したルールをFirebaseへ反映する。
- Firestoreルールを変更した時は、Firebase Consoleの構文検査を通し、公開後に未認証RESTアクセスが `403` になることを確認する。
- 記録内の `eventIds`、`relatedEvents`、`calendarContext` は、`app-data.js` の共通処理で読込時と保存前に正規化する。配列の保存形式を変更する時は、ホームと一覧・詳細の両バックエンド、および不正要素・初期版記録のランタイムテストを同時に更新する。
- Firebase App CheckはreCAPTCHA Enterpriseを使用する。サイトキーは公開用識別子であり、秘密鍵ではない。
- App Checkを更新する時は、以下の順序を守る。
  1. App CheckへWebアプリを登録する。
  2. `firebase-client.js` ではAuthenticationを先に独立して初期化する。
  3. ログイン後のデータアクセス時にApp Checkを初期化し、その後でFirestoreを初期化する。
  4. GitHub Pagesへ公開し、本番リクエストが有効なApp Checkトークンとして計測されることを確認する。
  5. 最後にCloud Firestoreの強制適用を有効にする。Authenticationはログイン互換性を維持するため非適用とする。
- App CheckをAuthenticationより先に初期化するとGoogleログインを妨げる可能性があるため、上記の初期化順を変更しない。
- クライアント公開前にApp Checkを強制適用しない。先に強制すると、正規ユーザーの保存・閲覧も拒否される。

### Firebase Web SDKの更新確認

- CDN読込の版は `firebase-client.js` の `FIREBASE_SDK_VERSION` で一元管理する。
- [Firebase JavaScript SDK公式リリースノート](https://firebase.google.com/support/release-notes/js) を確認し、Authentication、App Check、Cloud Firestore、またはセキュリティに関係する変更を優先する。
- 使用していない製品だけの機能追加であれば、最新版へ追従すること自体を目的に更新しない。
- 更新する場合は専用PRへ分離し、Pythonテスト、全JavaScript構文、JSON構文、Googleログイン、記録一覧・詳細、PC・スマホ表示を確認してから公開する。

## 公開してはいけないもの

- 個人のログ、実作業メモ
- Firebaseの秘密鍵やサービスアカウント
- ローカルだけで使う検証サーバー
- 実運用に使わない古い計画書
