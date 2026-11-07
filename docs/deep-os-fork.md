# DEEP OS向けPostiz改良版

JARVISでSNS接続を始め、Postizでの操作後にJARVISへ戻るための改良版です。接続状態だけを、秘密の値を取り出さずに確認する窓口も追加しました。稼働版の切替や本物のSNS操作は、この実装作業では行いません。

- 公開ソース：**https://github.com/OMrice8383/postiz-app**
- 持ち主・保守担当：基盤（arch-chief）。基盤Repoと同じ `OMrice8383` 名義。GitHub上の種別はUserです。
- 土台：公式 `gitroomhq/postiz-app` の `v2.25.3`、commit `a5affe62c74e39c1e7ac960d50d8418b807d532c`。
- 改良版の既定ブランチ：`deep-os/v2.25.3`。公式の `main` はそのまま残します。履歴の強制上書きはしません。
- 依頼・結果：[deep-os-platform #462](https://github.com/OMrice8383/deep-os-platform/issues/462)。設計：[JARVISの提案書](https://github.com/OMrice8383/deep-os-jarvis/blob/main/docs/qa/SNS_G16_T06_POSTIZ_API_ADDITION_PROPOSAL_2026-11-07.md)。

## 追加したものは2つ

### 1. 固定したJARVISへの戻り先

`GET /api/public/v1/social/{provider}` に `returnTo=jarvis` を付けると、サーバー設定 `JARVIS_CONNECT_RETURN_URL` を既存のRedis `redirect:{state}` へ1時間保存します。Organizationとstateは従来どおりPostizが決めます。任意の復帰URLや呼出側のstateは使いません。

設定できるのは、運用者が承認したHTTPSのoriginに、正確な `/settings/sns-accounts/return` を付けたURLだけです。ユーザー名・パスワード・query・fragment・非正規化のURLは拒否します。originは設定値そのものが唯一の基準です。Hostヘッダーやリクエストから作ったり、任意のドメイン一覧を増やしたりしません。

```dotenv
# 空の例。正式なoriginはPMが確定するまで入れない。
JARVIS_CONNECT_RETURN_URL=""
```

backendとfrontendの**サーバープロセスへ同じ値**を渡します。新しい `NEXT_PUBLIC_*` はありません。callbackの動的なサーバーページが検証済みの公開URLだけを画面へ渡すため、URLの変更だけなら再ビルドは不要です。既存の `.env`・composeによる秘密管理は変えません。

- 未指定の `returnTo` は従来どおり。不明値、不正・未設定のURL、対象外のproviderは認可URLを発行する前に400で拒否します。
- JARVIS向けは `instagram` と `tiktok` のみ。TikTokの実際の有効化は別Taskです。既存のprovider許可設定も引き続き適用します。
- 保存とInstagramのページ選択が成功してから、固定URLへ通常の外部遷移をします。`msg`・`added`・code・stateなどのqueryは付けません。
- 拒否・失敗・通信エラー・期限切れでは、安全な定型文と「JARVISへ戻って確認」を出します。JARVISへSNSのエラー原文は転送しません。
- 失敗時の戻るボタンは、この設定を持つ配置のcallback画面で表示します。stateやログインの証明ではありません。JARVIS側で本人・店・権限・契約・試行を再検査し、状態を読み直してください。
- Instagramの選択中の状態は従来と同じ画面内のメモリです。タブを閉じた場合や再読込後の自動復帰は保証しません。元のJARVISタブの再確認導線を残してください。
- callback応答は `Referrer-Policy: no-referrer` と `Cache-Control: no-store`。既存のAccess保護は維持し、callbackのqueryをログや外部解析へ送らない運用も続けます。

SNSに登録した `redirect_uri`、OAuth stateの生成・照合、コードとトークンの交換、Instagramの選択API、トークン保存は変更していません。`FRONTEND_URL`・`MAIN_URL`・`NEXT_PUBLIC_BACKEND_URL` をJARVISへ差し替えないでください。

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

**ここからは未実行の運用手順です。** この文書を作ったことは、切替の承認や実施を意味しません。了承、正式なJARVIS URL、切替imageのID、JARVISの戻り画面と読取処理、公開ソースのリンク表示を確認してから進めます。

### 切替を止める条件：callbackのログ対策

**callbackのqueryをアクセスログへ残さない実設定は、まだ確認できていません。** 元の `var/docker/nginx.conf` は標準のアクセスログを有効にしており、callbackを除外していません。新しい画面のReferrer-Policyだけで、このログ対策も済んだとは扱いません。

切替担当は候補imageと採用するnginx設定を `nginx -T` などで点検し、`/integrations/social/{provider}` のcode・state・error等のqueryを保存しない非秘密設定を先に用意します。Cloudflare・アプリ側のquery記録や外部解析も対象にします。架空のcallback要求を使い、ログへqueryが残らないこと、応答のno-referrer/no-store、既存のAccess保護が保たれることを確認し、切替担当Issueへ結果を記録してください。ログへ出す確認値も架空のものだけにします。

**この確認が通らなければ切り替えません。** 必要なログ設定の変更・稼働版への反映は、今回実行していない切替Taskで扱います。本物のSNS接続で代わりに確かめることはしません。

読取で確認した現在の配置：

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

担当は基盤（arch-chief）です。**セキュリティ修正が出た時はその都度、通常の見直しは月1回**行います。Dependabotの週次確認も補助に使いますが、セキュリティ告知の確認や上流の版更新の代わりにはしません。

1. 公式のRelease・Security Advisory・更新履歴を確認し、採用する公式tag/commitと理由を基盤Issueへ記録します。指定版より先の公式 `main` を自動で混ぜません。
2. 新しい保守ブランチを作り、公式の更新とこの2機能の差分を取り込みます。OAuth・state・ページ選択・Public認証の変更箇所を読み直します。競合を機械的に片方へ寄せません。
3. schema変更、起動時のDB更新、Temporalの互換性を確認します。違いがあれば控えと戻し方を先に決めます。
4. 専用試験、全アプリbuild、独立レビューを行います。通常フロー、拒否・期限切れ・通信失敗、Instagram2段階、店境界・秘密非取得を含めます。新しいSNSへの対応やAPI追加は同じ更新へ混ぜません。
5. ソースを公開し、ソースcommitとimage digestを記録します。切替承認後に上の手順で切り替え、結果をIssueへ記録します。公開URLの店向け表示も採用版と揃えます。

## AGPL-3.0と店向けのリンク

元の `LICENSE` と著作権表示は維持します。改良版のソース・ビルド用ファイル・今回の変更を公開Repoで取得できます。秘密の設定は対応ソースに入れません。

JARVIS側の別Taskで、店から見える設定画面などへ「Postiz（改良版）のソース」のリンクを出します。リンク先は **https://github.com/OMrice8383/postiz-app**、採用imageに対応する固定ソースは `https://github.com/OMrice8383/postiz-app/tree/<source-commit>` です。キー・店ID・接続のstateなどをURLへ付けません。UI実装と実際の掲示確認はこのfork作業の完了には含めず、ネットワークで利用させる前の切替確認に含めます。
