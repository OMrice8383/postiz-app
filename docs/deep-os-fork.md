# DEEP OS向けPostiz改良版

JARVISでSNS接続を始め、Postizでの操作後にJARVISへ戻るための改良版です。接続状態だけを、秘密の値を取り出さずに確認する窓口も追加しました。稼働版の切替は別の明示指示で行い、本物のSNS操作は別の了承があるまで行いません。

- 公開ソース：**https://github.com/OMrice8383/postiz-app**
- 持ち主・保守担当：基盤（arch-chief）。基盤Repoと同じ `OMrice8383` 名義。GitHub上の種別はUserです。
- 土台：公式 `gitroomhq/postiz-app` の `v2.25.3`、commit `a5affe62c74e39c1e7ac960d50d8418b807d532c`。
- 改良版の既定ブランチ：`deep-os/v2.25.3`。公式の `main` はそのまま残します。履歴の強制上書きはしません。
- 依頼・結果：[deep-os-platform #462](https://github.com/OMrice8383/deep-os-platform/issues/462)。設計：[JARVISの提案書](https://github.com/OMrice8383/deep-os-jarvis/blob/main/docs/qa/SNS_G16_T06_POSTIZ_API_ADDITION_PROPOSAL_2026-11-07.md)。

## 稼働記録：2026-11-07

長倉さんの判断と実施指示を受け、deep-dev2のPostiz本体だけを18:00:00〜18:00:24 JSTに切り替えました。稼働imageは `postiz-fork:462-2b255fdb`、製品コードは承認済みの固定版と同じです。直前の控えを取得・検査し、切替後の一覧とhealth、認証拒否、callbackヘッダー、正式戻り先設定を確認しました。DB構造の差分は0、他コンテナと既存volumeは不変です。

元imageと戻し設定は確認済みですが、正常終了したため実際の切戻しは行っていません。本物SNSの接続・投稿も未実施です。[完了根拠](https://github.com/OMrice8383/deep-os-platform/issues/462#issuecomment-6704836665)を参照してください。以後の再作成も `compose.fork.yaml` を含め、baseだけの `up` で意図せず公式版へ戻さないようにします。

## 追加したものは2つ

### 1. 固定したJARVISへの戻り先

`GET /api/public/v1/social/{provider}` に `returnTo=jarvis` を付けると、サーバー設定 `JARVIS_CONNECT_RETURN_URL` を既存のRedis `redirect:{state}` へ1時間保存します。Organizationとstateは従来どおりPostizが決めます。任意の復帰URLや呼出側のstateは使いません。

設定できるのは、運用者が承認したHTTPSのoriginに、正確な `/settings/sns-accounts/return` を付けたURLだけです。ユーザー名・パスワード・query・fragment・非正規化のURLは拒否します。originは設定値そのものが唯一の基準です。Hostヘッダーやリクエストから作ったり、任意のドメイン一覧を増やしたりしません。

```dotenv
# 2026-11-07承認の正式値。開発での確認も同じ値を使う。
JARVIS_CONNECT_RETURN_URL="https://table.avante-works.com/settings/sns-accounts/return"
```

backendとfrontendの**サーバープロセスへ同じ値**を渡します。新しい `NEXT_PUBLIC_*` はありません。callbackの動的なサーバーページが検証済みの公開URLだけを画面へ渡すため、URLの変更だけなら再ビルドは不要です。既存の `.env`・composeによる秘密管理は変えません。

- 未指定の `returnTo` は従来どおり。不明値、不正・未設定のURL、対象外のproviderは認可URLを発行する前に400で拒否します。
- JARVIS向けは `instagram` と `tiktok` のみ。TikTokの実際の有効化は別Taskです。既存のprovider許可設定も引き続き適用します。
- 保存とInstagramのページ選択が成功してから、固定URLへ通常の外部遷移をします。`msg`・`added`・code・stateなどのqueryは付けません。
- 拒否・失敗・通信エラー・期限切れでは、安全な定型文と「JARVISへ戻って確認」を出します。JARVISへSNSのエラー原文は転送しません。
- 失敗時の戻るボタンは、この設定を持つ配置のcallback画面で表示します。stateやログインの証明ではありません。JARVIS側で本人・店・権限・契約・試行を再検査し、状態を読み直してください。
- Instagramの選択中の状態は従来と同じ画面内のメモリです。タブを閉じた場合や再読込後の自動復帰は保証しません。元のJARVISタブの再確認導線を残してください。
- callback応答は `Referrer-Policy: no-referrer` と `Cache-Control: no-store`。既存のAccess保護は維持します。nginxの記録の扱いは、下記の2026-11-07の決定に従います。

OAuth stateの生成・照合・有効期限、Instagramの選択API、トークン保存は変更していません。`redirect_uri` の任意設定は次節だけです。`FRONTEND_URL`・`MAIN_URL`・`NEXT_PUBLIC_BACKEND_URL` をJARVISや専用callbackの名前へ差し替えないでください。

### Instagramだけの専用callback（#638、未配備）

[基盤 #638の限定案](https://github.com/OMrice8383/deep-os-jarvis/issues/638)に従い、Instagramの戻り先だけを分ける任意設定を追加しました。他のSNS・通常画面・全体のAPI宛先は変えません。**T04の確認とT09の独立した安全レビューが両方済むまで、この変更を配備してはいけません。** この節はDNS・tunnel・稼働設定の変更指示ではありません。

```dotenv
# 架空の例。運用者が承認した完成形のURLを、backend/frontend両サーバーへ同じ値で渡す。
INSTAGRAM_CALLBACK_URL="https://callback.example/integrations/social/instagram"
```

- HTTPSの完成形だけを受け付け、道は正確な `/integrations/social/instagram` に固定します。HTTP、ユーザー情報、query、fragment、末尾の `/`、余分な道、正規化が必要な表記は拒否します。不正設定は値を表示せずエラーにし、旧URLへ黙って戻しません。Hostヘッダーは使いません。
- 専用設定があると、Instagramの認可URLとコード交換は同じ検証済みURLを使います。交換時に `refresh` のqueryを追加しません。未設定・空なら、末尾の `/` や交換時の `refresh` を含め、従来の `FRONTEND_URL` からの文字列連結をそのまま使います。
- Instagramのcallback画面だけ、同一originの `/api` へ局所的なfetchで送ります。全体layoutの応答処理（ログイン画面への移動など）は通しません。既存のJARVIS用fetchと通常fetchは維持します。新しい `NEXT_PUBLIC_*` 設定はありません。
- 必要なAPIは `POST /api/integrations/social-connect/instagram` と `POST /api/integrations/public/provider/:id/connect` の2つだけです。共有cookieがあってログイン済みでも、専用modeの保存は後者を使います。初回応答のページ一覧を継続UIへ渡すため、追加のpages取得APIや認証付き保存APIは必要ありません。全体layoutにも、この接続のための追加bootstrap APIはありません。
- 運用側で新名に許可するのは、Instagram callback、必要な `/_next/static/…`、上記2 APIだけです。API全体・認証付き `/api/integrations/provider/:id/connect` は公開しません。許可外は404とし、旧名のAccess保護は維持します。DNS・tunnelの設定と攻撃的な道の検査は基盤担当の別作業です。
- 未登録・期限切れのstate拒否、stateの生成・照合・有効期限、token保存、既存の固定JARVIS復帰先は変えません。本番SNS DB、実アカウント、実OAuth、投稿を使った確認は、この単体試験やPR作成には含めません。

### 2. 接続状態だけを読む窓口

`GET /api/public/v1/integrations/health`。JARVISサーバーから既存の店単位のPublic APIキーを生の `Authorization` ヘッダーへ入れます。`Bearer` は付けません。キーをブラウザへ渡しません。

```json
{
  "checkedAt": "2026-11-07T00:00:00.000Z",
  "integrations": [{
    "id": "fixture-integration",
    "identifier": "instagram",
    "disabled": false,
    "refreshNeeded": false,
    "inBetweenSteps": false,
    "tokenExpiration": null
  }]
}
```

上の値は架空の例です。返すのはこの外枠と6項目だけで、`Cache-Control: no-store` を付けます。認証したOrganizationの `type=social`、`deletedAt=null` の行だけを読みます。Repositoryで6列だけを選び、秘密列は取得しません。既存の一覧・管理者用debug APIの応答は変えません。

`x-postiz-org` は空値でも403で拒否し、管理者キーでも他店へ切り替えません。`organizationId` をクエリで指定しても対象は変わりません。`x-postiz-include-deleted` で削除済み行を追加する機能もありません。

この結果はPostizに記録された状態です。SNSへの即時の接続検査ではなく、トークン更新・投稿・予約も起動しません。空配列は正常な結果ですが、通信失敗を空配列へ置き換えないでください。`refreshNeeded`、`disabled`、`inBetweenSteps` は別々の意味で、`tokenExpiration=null` は健全や無期限の証明ではありません。画面表示・復帰・明示更新時のまとめ読みに使い、秒単位で呼び続けないでください。

## 組み立てと試験

秘密のない専用checkoutを使います。稼働中の `~/sns-postiz` やその `.env` を、このソースツリーやimageへコピーしません。Node `22.23.4`、pnpm `10.6.1` とlockfileを使います。新しい依存は加えていません。

```bash
corepack enable
corepack prepare pnpm@10.6.1 --activate
pnpm install --frozen-lockfile
# jsdom用の任意依存canvasが未構築の場合だけ、既存依存の構築を行う。
pnpm --dir node_modules/canvas run install
pnpm run test:jarvis
```

`test:jarvis` は外部サービスを使わない専用試験です。SNS・Redis・DBは架空の応答に置き換えています。元の `pnpm test` は `@nx/jest` を参照する既存設定ですが、この版にはその依存とテストプロジェクトがありません。この不足を埋めるための無関係な依存追加はせず、新しい試験を専用設定で動かします。

自前imageは元の `Dockerfile.dev` でfrontend/backend/orchestratorをまとめて組み立てます。**imageを起動する必要はありません**。Actionsには頼らず、サーバーで試験・buildします。forkのActionsは無効です。

初回だけ、他担当と分けたbuilderを作ります。作成済みならcreateは省略します。

```bash
docker buildx create --name postiz-462 --driver docker-container \
  --driver-opt cpu-period=100000 --driver-opt cpu-quota=200000 \
  --driver-opt memory=8g --driver-opt memory-swap=8g
docker buildx inspect postiz-462 --bootstrap
docker update --cpuset-cpus "$(python3 -c 'import os; print(",".join(map(str, sorted(os.sched_getaffinity(0))[:2])))')" \
  buildx_buildkit_postiz-4620
```

```bash
SOURCE_SHA=$(git rev-parse HEAD)
IMAGE="postiz-fork:462-${SOURCE_SHA:0:8}"
docker buildx build --builder postiz-462 --load --file Dockerfile.dev \
  --build-arg NEXT_PUBLIC_VERSION=2.25.3-deep.462 \
  --label org.opencontainers.image.source=https://github.com/OMrice8383/postiz-app \
  --label "org.opencontainers.image.revision=$SOURCE_SHA" \
  --tag "$IMAGE" .
docker image inspect "$IMAGE" --format '{{.Id}}'
```

上の `postiz-462` は今回の専用builder名です。初回はDockerのdocker-container driverで作り、CPU2・メモリ8GiBなど機械の空きに応じた上限を付けてください。他担当のbuilderは変更しません。ソースcommit・使用した土台imageのdigest・完成image ID・試験件数と失敗は、適用担当Issueへ記録します。buildが失敗した場合は、その版を切り替え候補にしません。

## 切替手順：了承後の別指示でだけ実行

**以下は実施指示を受けて使う運用手順です。** 文書があることだけを切替承認とは扱いません。2026-11-07の切替は長倉さんの判断を受け、18:00〜18:30に行う指示です。切替imageのID、控えと戻し方を先に確認します。JARVIS側の受け口と公開ソースリンクの作成状況は同担当へ引き継ぎ、本物のSNS接続・投稿の受入は別の指示で行います。

### 切替前の確認とnginxの記録の扱い

2026-11-07 17:20の長倉さん決定により、残っていた2条件も解消済みです。**正式な戻り先は `https://table.avante-works.com/settings/sns-accounts/return` に固定**し、開発での確認も同じ値を使います。JARVIS側の受け口はT05が作成中です。**元ソフトの安全性警告は、今回の固定版 `deep-os-v2.25.3-platform-462` のまま採用してよい**との判断です。根拠は [platform #462の受領記録](https://github.com/OMrice8383/deep-os-platform/issues/462#issuecomment-6704412151) に残しています。

2026-11-07の長倉さんの判断により、SNSから戻るときのアドレスの中身がnginxの記録に残る件は、切替を止める理由にしません。記録を除外したことの確認を切替条件から外します。根拠は [platform #462の決定記録](https://github.com/OMrice8383/deep-os-platform/issues/462#issuecomment-6704305884) です。元のnginx設定は変更しません。

応答のno-referrer/no-storeや既存のAccess保護は維持します。この判断は、秘密をGit・Issue・Discordへ転載する許可や、本物のSNSへ接続・投稿する許可ではありません。

切替前に確認した配置（2026-11-07）：

- 機械・ディレクトリ：deep-dev2、`~/sns-postiz`。
- composeのproject名：**`sns-t02-postiz`**。ディレクトリ名から別projectを作らないこと。
- 元の指定ファイル：`compose.yaml` と `compose.override.yaml`。
- 差し替えるservice：`postiz` だけ。PostgreSQL・Redis・Temporal・tunnelは触りません。
- 読取時の元image：`ghcr.io/gitroomhq/postiz-app:v2.25.3`。
- その稼働digest：`ghcr.io/gitroomhq/postiz-app@sha256:1e376ff2cb781022d528f171719cf174cf693a985a30cb40eefb13eae3ddda13`。
- `/config` と `/uploads` は既存volumeを引き継ぎます。

### 切替前の控え

切替直前に取り直します。控えはGit外・本人だけが読める場所へ置き、Issueへ秘密やdumpの中身を貼りません。

```bash
cd "$HOME/sns-postiz"
umask 077
BACKUP="$HOME/.local/state/postiz-462/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
cp -a compose.yaml compose.override.yaml .env "$BACKUP/"
docker inspect sns-t02-postiz-postiz-1 \
  --format '{{.Config.Image}} {{.Image}}' > "$BACKUP/image.txt"
docker compose -p sns-t02-postiz -f compose.yaml -f compose.override.yaml \
  exec -T postiz-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP/postiz.dump"
```

今回のforkはPrisma schemaとDBを変更しません。ただし元の起動処理は `prisma-db-push` を含みます。採用imageと稼働版のschemaが同じことを切替前に照合してください。上流更新でschema差分が出たときは、この単純なimage戻しを流用せず、DB復旧も含む手順を別途承認・検証します。

### `postiz` だけの切替

`~/sns-postiz/compose.fork.yaml` をローカルに用意します。imageには上で確認した自前imageのタグを入れ、環境変数にはPMが確定した公開URLだけを入れます。既存の秘密は書き写しません。

```yaml
services:
  postiz:
    image: postiz-fork:462-REPLACE_WITH_VERIFIED_SHA
    pull_policy: never
    environment:
      JARVIS_CONNECT_RETURN_URL: ${JARVIS_CONNECT_RETURN_URL:?Set the approved fixed JARVIS URL}
```

正式なURLを既存のローカル設定へ追加するか、切替用シェルで設定します。backend/frontendはこの同じservice内のプロセスなので、同じ値を受け取ります。imageのタグとURLの仮置きを残したまま実行しないでください。

```bash
cd "$HOME/sns-postiz"
docker compose -p sns-t02-postiz -f compose.yaml -f compose.override.yaml \
  -f compose.fork.yaml config --quiet
docker compose -p sns-t02-postiz -f compose.yaml -f compose.override.yaml \
  -f compose.fork.yaml up -d --no-deps --no-build postiz
```

このコマンドは切替時にだけ使います。`down`・`down -v`・volume削除・全serviceの更新は行いません。Access保護・API専用tunnelの公開範囲は変えません。切替後も、本物のSNS接続・投稿・予約は別の了承なしに行いません。JARVISサーバーから状態APIを読み、秘密を表示せず、通常のPostiz画面も確認します。新しいOAuth接続の受入は別Taskです。

## 切替前へ戻す手順

1. JARVIS担当へ、新しい接続開始を一時停止するよう依頼します。公式版に戻すとhealthは404になります。JARVISは「未接続」ではなく「確認できない」と扱い、投稿へ進めないことを確認します。
2. 切替直前に控えたimageのdigestを使います。下のdigestは読取時のものなので、実施時は控えと照合します。

```yaml
# ~/sns-postiz/compose.rollback.yaml（Gitには置かない）
services:
  postiz:
    image: ghcr.io/gitroomhq/postiz-app@sha256:1e376ff2cb781022d528f171719cf174cf693a985a30cb40eefb13eae3ddda13
    pull_policy: never
```

```bash
cd "$HOME/sns-postiz"
# fork用のoverlayは指定せず、元のファイルと戻し用overlayだけを使う。
docker compose -p sns-t02-postiz -f compose.yaml -f compose.override.yaml \
  -f compose.rollback.yaml config --quiet
docker compose -p sns-t02-postiz -f compose.yaml -f compose.override.yaml \
  -f compose.rollback.yaml up -d --no-deps --no-build postiz
```

3. 元の画面、既存の接続一覧、稼働imageのdigestを確認し、Issueへ戻した時刻と結果を書きます。既存データ・volumeは消しません。今回の差分の復旧にDBの上書き復元は使いません。復旧のために本物のSNSへ投稿して確認することもありません。

## 公式版への追従

担当は基盤（arch-chief）です。**セキュリティ修正が出た時はその都度、通常の見直しは月1回**行います。Dependabotの週次確認も補助に使いますが、セキュリティ告知の確認や上流の版更新の代わりにはしません。自動統合はせず、サーバーで確認します。

初回のGitHub検査では、元の依存に安全性の警告が残りました。criticalの2通知は同じ `@sentry/nextjs` の [CVE-2026-114139](https://github.com/advisories/GHSA-mchm-gjx6-7h55) をmanifestとlockfileで数えたものです。修正版は10.75.2です。公式の告知では `tunnelRoute` 使用などが成立条件で、今回の設定にはその指定がありません。全警告の影響判定や依存更新を済ませたとは扱いません。2026-11-07 17:20に長倉さんが、公式版と同じ上流へ2機能を加えた今回の固定版のまま採用してよいと判断しました。今回は依存を無断で更新せず、この判断で切り替えます。今後もセキュリティ修正時と月1回の確認を続け、次の採用版の根拠を担当Issueへ記録します。

1. 公式のRelease・Security Advisory・更新履歴を確認し、採用する公式tag/commitと理由を基盤Issueへ記録します。指定版より先の公式 `main` を自動で混ぜません。
2. 新しい保守ブランチを作り、公式の更新とこの2機能の差分を取り込みます。OAuth・state・ページ選択・Public認証の変更箇所を読み直します。競合を機械的に片方へ寄せません。
3. schema変更、起動時のDB更新、Temporalの互換性を確認します。違いがあれば控えと戻し方を先に決めます。
4. 専用試験、全アプリbuild、独立レビューを行います。通常フロー、拒否・期限切れ・通信失敗、Instagram2段階、店境界・秘密非取得を含めます。新しいSNSへの対応やAPI追加は同じ更新へ混ぜません。
5. ソースを公開し、ソースcommitとimage digestを記録します。切替承認後に上の手順で切り替え、結果をIssueへ記録します。公開URLの店向け表示も採用版と揃えます。

## AGPL-3.0と店向けのリンク

元の `LICENSE` と著作権表示は維持します。改良版のソース・ビルド用ファイル・今回の変更を公開Repoで取得できます。秘密の設定は対応ソースに入れません。

JARVIS側の別Taskで、店から見える設定画面などへ「Postiz（改良版）のソース」のリンクを出します。リンク先は **https://github.com/OMrice8383/postiz-app**、採用imageに対応する固定ソースは `https://github.com/OMrice8383/postiz-app/tree/<source-commit>` です。キー・店ID・接続のstateなどをURLへ付けません。UI実装と実際の掲示確認はこのfork作業の完了には含めず、ネットワークで利用させる前の切替確認に含めます。
