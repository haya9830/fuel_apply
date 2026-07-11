# Fuel Apply

日々の機械の使用状況をスマートフォンから入力し、OneDrive上のExcelブックの指定セルへ保存するExpo/React Nativeアプリです。

## MVPの動作

1. Microsoftアカウントでサインイン
2. 機械のリストから対象機械を選択
3. 記録日、稼働時間（時・分）、給油量を入力
4. Excelの該当ページ・該当日の行から現在値を読み込み
5. 稼働時間と給油量をMicrosoft Graphで更新

Excelの更新にはMicrosoft GraphのExcel Range Update APIを使います。元帳票は1ページあたり6台分の機械欄を持ち、日付1〜31を行10〜40へ対応させています。今回、元ファイルの記入例シートを同じ空欄フォーマットへ戻して第2ページとして再利用し、12台分（6台×2ページ）へ拡張しました。

入力セルの対応は次のとおりです。

- 1ページ目: 機械1〜6、列 `H:Y`
- 2ページ目: 機械7〜12、列 `H:Y`
- 各機械: 稼働時間（時）、稼働時間（分）、給油量の3列
- 例: 1ページ目の機械1で4月1日を入力すると `H10`、`I10`、`J10` を更新

## セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. Microsoft Entraアプリを登録

Microsoft Entra admin centerでモバイル用のアプリ登録を作成し、次の設定を行います。

- リダイレクトURI: `fuelapply://redirect`
- Delegated permissions: `User.Read`, `Files.ReadWrite`, `offline_access`, `openid`, `profile`
- Authorization code flow with PKCEを利用

Expo Goで実行する場合は、実行時に表示されるリダイレクトURIをアプリ登録へ追加してください。ストア配布用のビルドでは `fuelapply://redirect` を登録します。

### 3. `app.json`を設定

`extra.auth.clientId`、`extra.excel.workbookId`、`extra.excel.worksheetName`、`extra.machines`を実際の値に変更します。`extra.machines`の機械名は、完成したExcelのヘッダー名と合わせてください。

```json
{
  "extra": {
    "auth": { "clientId": "Microsoft Entraのアプリケーション(client) ID" },
    "excel": {
      "workbookId": "OneDrive上のExcelファイルのアイテムID",
      "worksheetName": "入力"
    },
    "machines": [
      {
        "id": "excavator-01",
        "name": "油圧ショベル1号",
        "worksheetName": "軽油第12号様式(2)",
        "hoursColumn": "H",
        "minutesColumn": "I",
        "fuelColumn": "J"
      }
    ]
  }
}
```

`workbookId`はExcelの共有リンクに含まれるURLではなく、OneDrive/SharePointのDrive Item IDです。Graph Explorerなどで対象ファイルを確認して取得してください。`worksheetName`は、付属の拡張済み帳票のシート名と一致させます。

### 4. 起動と検証

```bash
npm run typecheck
npm test
npx expo start
```

## セキュリティと運用上の注意

- Microsoftのアクセストークンは端末のSecureStoreへ保存し、Excelファイルの内容をアプリ内にキャッシュしません。
- `clientId`と`workbookId`はアプリに含まれてもよい識別子ですが、クライアントシークレットは絶対にアプリへ含めないでください。
- アプリ利用者には対象Excelへの編集権限が必要です。
- 現状はMicrosoftアカウントでサインインしたユーザーのOneDrive (`/me/drive`) を対象にします。共有ドライブやSharePointを対象にする場合はGraphのパス設定を追加してください。
