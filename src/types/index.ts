/**
 * 型定義ファイル
 * アプリケーション全体で使用する型定義をまとめたファイル
 */

// 設定関連の型定義

// 通知関連の型定義
export type NotificationConfig = {
  enabled: boolean;
  gasUrl: string;
  apiKey: string;
};

export type GoogleDriveConfig = {
  uploadEnabled: boolean;
  // サービスアカウント認証用
  serviceAccountKeyPath: string;
  // アップロード先フォルダ
  folderId: string;
  // スプレッドシートID
  spreadsheetId?: string;
};

export type DebugConfig = {
  debugEnabled: boolean;
  headless: boolean;
};

export type DataCleanupConfig = {
  enabled: boolean;
  retentionDays: number;
};

export type Config = {
  browserPath?: string;
  topPage: string;
  pdfKeywords: string[];
  projectTitle: string;
  downloadOnlyNew: boolean;
  numberOfItems: 10 | 25 | 50 | 100;
  fileCheckEnabled: boolean;
  downloadTimeoutSec: number;
  pdfClickDelaySec: number;
  notification: NotificationConfig;
  googleDrive: GoogleDriveConfig;
  debug: DebugConfig;
  dataCleanup: DataCleanupConfig;
};

// 契約情報の型定義
export type Contract = {
  contractId: string;
  contractName: string;
  linkArg: string;
  releaseDate: string;
  isNew: boolean;
  sectionName: string;
};

// PDFファイル情報の型定義
export type PdfFile = {
  fileName: string;
  href: string;
  enableDownload: boolean;
};

// ダウンロードファイル情報の型定義（ダウンロードサービスの戻り値）
export type DownloadFiles = {
  downloaded: string[];
  notDownloaded: string[];
};

// Google Driveへのアップロード状態
export type UploadStatus = 'pending' | 'success' | 'failed';

// Google Driveへのアップロード結果
export type UploadResult = {
  fileName: string;
  fileId?: string;
  status: UploadStatus;
  error?: string;
};

// ダウンロード結果の型定義（履歴管理用）
export type DownloadResult = {
  contractId: string;
  contractName: string;
  sectionName: string;
  downloaded: string[];
  notDownloaded: string[];
  uploaded?: UploadResult[];
};

// ダウンロード失敗ファイルの型定義
export type FailedDownload = {
  contractId: string;
  contractName: string;
  sectionName: string;
  fileName: string;
};

// アップロード失敗ファイルの型定義
export type FailedUpload = {
  contractId: string;
  contractName: string;
  sectionName: string;
  fileName: string;
  error: string;
};

// 契約詳細情報の型定義（スプレッドシート用）
export type ContractDetails = {
  年度?: string;
  業務名?: string;
  契約管理番号?: string;
  入札方式?: string;
  業種?: string;
  業務場所?: string;
  業務内容?: string;
  公開日?: string;
  参加受付開始?: string;
  参加受付期限?: string;
  入札締切日時?: string;
  開札日?: string;
  予定価格?: string;
  発注等級?: string;
  WTO条件付一般競争入札方式の型?: string;
  備考?: string;
  課所名?: string;
  公告資料?: string; // Google Driveフォルダへのリンク
};