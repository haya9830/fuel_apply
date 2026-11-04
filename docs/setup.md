# 管理者の接続・配布手順

この設定はアプリを配布する管理者が一度行います。利用者はURLを開いてGoogleへ接続するだけで、Node.jsやExpoは不要です。

## 1. Google Cloudで接続を用意する

1. 管理するGoogleアカウントでGoogle Cloudプロジェクトを用意します。
2. **Google Drive API**と**Google Picker API**を有効化します。
3. Google Auth platformでアプリ名・連絡先・対象ユーザーを設定します。テスト運用なら使用するGoogleアカウントをテストユーザーに追加します。利用者には対象Excelの編集権限も必要です。
4. OAuthクライアントを「ウェブアプリケーション」で作成します。承認済みのJavaScript生成元に、配布するURLのオリジンを登録します（パスは含めません）。開発中は`http://localhost:4173`と、Expoで使う場合は`http://localhost:8081`も登録します。
5. Google Picker用のAPIキーを用意します。使用APIをPicker API・Drive APIに制限し、HTTPリファラーを配布先とGoogle Pickerに必要な`https://docs.google.com/*`に制限します。ローカル確認時だけlocalhostの該当ポートも追加します。
6. **OAuthクライアントID・APIキー・プロジェクト番号**を控えます。プロジェクトIDの文字列とプロジェクト番号は別です。

クライアントシークレットは使いません。OAuthクライアントID・Picker APIキー・プロジェクト番号はブラウザで使用する公開設定です。APIキーには必ず使用元/API制限を付けてください。認証情報の作成やOAuth同意を管理者が承認するまでは、実ファイルへ接続できません。

参考：[Google Pickerの公式設定手順](https://developers.google.com/workspace/drive/picker/guides/web-picker)、[Driveの権限](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## 2. 配布用の設定を入れる

`.env.example`を`.env.local`へコピーして3項目を入力します。`.env.local`はGit管理しません。

```text
EXPO_PUBLIC_GOOGLE_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_API_KEY=...
EXPO_PUBLIC_GOOGLE_APP_ID=...
```

`app.json`の`extra.google`へ公開設定を直接記入することも可能ですが、実際の設定をGitに載せる必要はありません。ビルド時に環境変数を優先します。

機械名や転記先は`extra.machines`で設定します。初期値は付属Excelの12台分です。実際の機械と帳票の並びに合わせ、配布前に名前をそろえます。`extra.excel.fileId`を設定すると、指定したファイル以外への保存を拒否できます。空文字ならPickerで対象月のファイルを選びます。`extra.excel.period`も必要な場合だけ`YYYY-MM`で固定できます。

## 3. ExcelをGoogle Driveへ置く

1. `outputs/`にある12台対応のExcelを対象月用にコピーします。
2. Google Driveへ**Excelのまま**アップロードします。「Googleスプレッドシートとして保存」は不要です。
3. 機械名、前月末メーター（各シートのJ7・M7・P7・S7・V7・Y7）などを整えます。これらはアプリから自動補完しません。
4. 利用者のGoogleアカウントに編集権限を付けます。一般公開する必要はありません。

毎月、新しい帳票コピーを用意して、保存時にその月のExcelを選びます。A3の対象月は空欄・`年　月`なら初回保存で設定されます。既に記入する場合は`2026年11月`のような形式にしてください。異なる月の帳票への保存は拒否します。

## 4. ビルドと公開

```bash
npm ci
npm run typecheck
npm test
npm run build:web
```

生成された`dist/`をHTTPSホストへ配置します。接続確認前の配布URLを「利用可能」と案内しないでください。

GitHub Pagesを使う場合：

1. リポジトリのSettings → Pagesで、SourceをGitHub Actionsに設定します。
2. リポジトリのActions secretsに上記と同名の3値を登録します。これは公開設定をGit履歴へ残さないためで、ビルドされたブラウザコードからは読み取れます。
3. OAuthのJavaScript生成元には配布先のオリジン（ユーザーサイトなら`https://haya9830.github.io`）を登録し、APIキーのリファラーには実際の配布パスを登録します。
4. `Deploy PWA to GitHub Pages`を手動実行します。ワークフローは`/fuel_apply`のパスでビルドします。
5. Actionsの完了結果に表示されたURLを開きます。OAuthの有効化・公開範囲は管理者が確認します。

## 5. 配布前の実接続テスト

本番帳票のコピーを使います。

- スマートフォンで2台分を入力し、保存後にExcelの月末セルとA3を確認する。
- 日別欄、印刷レイアウト、前月末の値が維持されていることをExcelで確認する。
- Googleの接続やPickerをキャンセルしても入力が残ることを確認する。
- 別の月の帳票とGoogleスプレッドシートを選ぶと保存が止まることを確認する。
- 一度オンラインで開いた後、オフラインで再起動・入力・復元できることを確認する。
- iPhone / Androidそれぞれでホーム画面からの起動とGoogle接続を確認する。端末・ブラウザによってはポップアップを許可してもう一度保存が必要です。

Googleのトークンはメモリ内だけで保持します。アプリを閉じた後は再接続が必要になることがあります。
