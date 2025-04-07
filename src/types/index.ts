/**
 * 型定義ファイル
 * アプリケーション全体で使用する型定義をまとめたファイル
 */

// 設定関連の型定義
export type EmailConfig = {
  sendEmailEnabled: boolean;
  user: string;
  pass: string;
  to: string;
};

export type DebugConfig = {
  debugEnabled: boolean;
  headless: boolean;
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
  mail: EmailConfig;
  debug: DebugConfig;
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

// ダウンロード結果の型定義（履歴管理用）
export type DownloadResult = {
  contractId: string;
  contractName: string;
  sectionName: string;
  downloaded: string[];
  notDownloaded: string[];
};

// ダウンロード失敗ファイルの型定義
export type FailedDownload = {
  contractId: string;
  contractName: string;
  sectionName: string;
  fileName: string;
};