# 入札情報PDFダウンローダー (Bid Information PDF Downloader)

岩手県入札情報公開サービスから特定の業務に関するPDFファイルを自動的にダウンロードするツールです。Raspberry Pi 3 (Raspbian)上で動作します。

## 機能

- 岩手県入札情報公開サービスから特定の業務名を含む案件を検索
- 設定したキーワードを含むPDFファイルを自動ダウンロード
- ダウンロード結果をメールで通知（オプション）
- ダウンロード履歴の管理

## 必要条件

- Node.js (v14以上)
- Raspberry Pi 3 (Raspbian)
- Chromium ブラウザ

## インストール方法

1. リポジトリをクローンまたはダウンロードします

```bash
git clone https://github.com/yourusername/bid-info-downloader.git
cd bid-info-downloader
```

2. 依存パッケージをインストールします

```bash
npm install
```

3. Playwrightのブラウザをインストールします（必要に応じて）

```bash
npx playwright install chromium
```

4. 設定ファイルを作成します

```bash
cp config_example.toml config.toml
```

5. `config.toml` を編集して設定を行います

## 設定

`config.toml` ファイルで以下の設定を行います：

- `topPage`: 岩手県入札情報公開サービスのトップページURL
- `projectTitle`: 検索する業務名（例: "設計"）
- `downloadOnlyNew`: 新着案件のみダウンロードするかどうか
- `numberOfItems`: 1ページあたりの表示件数（10, 25, 50, 100）
- `pdfKeywords`: ダウンロードするPDFのキーワード（例: ["公告", "図面"]）
- `fileCheckEnabled`: ダウンロード後にファイルの存在チェックを行うかどうか
- `downloadTimeoutSec`: ダウンロードのタイムアウト時間（秒）
- `pdfClickDelaySec`: PDFリンクのクリック間隔（秒）

メール通知を使用する場合は、`[mail]` セクションで以下の設定を行います：

- `sendEmailEnabled`: メール送信を有効にするかどうか
- `user`: Gmailのユーザー名
- `pass`: GoogleのAppパスワード
- `to`: 送信先メールアドレス

デバッグ設定は、`[debug]` セクションで行います：

- `debugEnabled`: デバッグモードを有効にするかどうか
- `headless`: ヘッドレスモードを有効にするかどうか

## 使用方法

1. ビルドします

```bash
npm run build
```

2. 実行します

```bash
npm start
```

開発モードで実行する場合（ビルドと実行を一度に行う）：

```bash
npm run dev
```

## プロジェクト構造

```
src/
├── types/                  # 型定義
│   └── index.ts            # すべての型定義
├── services/               # 機能ごとのサービス
│   ├── browserService.ts   # ブラウザ操作関連
│   ├── downloaderService.ts # ダウンロード処理
│   ├── fileManager.ts      # ファイル管理
│   └── historyManager.ts   # ダウンロード履歴管理
├── utils/                  # ユーティリティ関数
│   └── helpers.ts          # 汎用ヘルパー関数
├── config.ts               # 設定管理
├── logger.ts               # ロギング
├── mail.ts                 # メール送信
└── index.ts                # エントリーポイント
```

## Raspberry Pi での自動実行設定

crontabを使用して定期的に実行するように設定できます：

1. crontabを編集します

```bash
crontab -e
```

2. 以下の行を追加します（例: 毎日午前9時に実行）

```
0 9 * * * cd /path/to/bid-info-downloader && /usr/bin/node dist/index.js >> /path/to/bid-info-downloader/logs/cron.log 2>&1
```

## ライセンス

ISC

## 注意事項

- このツールは個人的な利用を目的としています
- サーバーに過度な負荷をかけないようにご注意ください