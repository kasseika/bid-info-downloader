import * as fs from 'fs';
import * as path from 'path';
import { DownloadResult, UploadResult } from '../types';
import { errorLogger, systemLogger } from '../logger';

/**
 * ダウンロード履歴管理サービス
 * ダウンロード履歴の読み込み、保存、更新などの機能を提供
 */
export class HistoryManager {
  private historyPath: string;
  private history: DownloadResult[];
  
  /**
   * コンストラクタ
   * ダウンロード履歴を初期化
   */
  constructor() {
    // プロジェクトのルートディレクトリに履歴ファイルを保存
    this.historyPath = path.join(process.cwd(), 'downloadHistory.json');
    this.history = this.loadHistory();
  }
  
  /**
   * ダウンロード履歴を読み込む
   * @returns ダウンロード履歴
   */
  private loadHistory(): DownloadResult[] {
    try {
      const data = fs.readFileSync(this.historyPath, 'utf8');
      return JSON.parse(data);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        systemLogger.info('downloadHistory.jsonを作成');
        return [];
      } else {
        errorLogger.error('履歴ファイルの読み込みに失敗しました', err);
        return [];
      }
    }
  }
  
  /**
   * ダウンロード履歴を取得
   * @returns ダウンロード履歴
   */
  getHistory(): DownloadResult[] {
    return this.history;
  }
  
  /**
   * ダウンロード履歴に追加
   * @param result ダウンロード結果
   */
  addToHistory(result: DownloadResult): void {
    this.history.push(result);
  }

  /**
   * アップロード結果を履歴に追加
   * @param contractId 契約ID
   * @param uploadResults アップロード結果の配列
   */
  addUploadResults(contractId: string, uploadResults: UploadResult[]): void {
    const contract = this.history.find(item => item.contractId === contractId);
    if (contract) {
      contract.uploaded = uploadResults;
      systemLogger.info(`契約 ${contractId} のアップロード結果を履歴に追加しました`);
    } else {
      errorLogger.error(`契約 ${contractId} が履歴に見つかりません`);
    }
  }

  /**
   * アップロードが必要なファイルのパスを取得
   * @param contractId 契約ID
   * @param dataPath データディレクトリのパス
   * @returns アップロードが必要なファイルのパスの配列
   */
  getFilesToUpload(contractId: string, dataPath: string): string[] {
    const contract = this.history.find(item => item.contractId === contractId);
    if (!contract) {
      return [];
    }

    // 契約IDに対応するフォルダを検索
    const files = fs.readdirSync(dataPath);
    const dirList = files.filter(file =>
      fs.statSync(path.join(dataPath, file)).isDirectory()
    );
    
    const folderName = dirList.find(dirName => dirName.startsWith(contractId));
    if (!folderName) {
      systemLogger.warn(`Folder for contract ${contractId} not found`);
      return [];
    }
    
    const contractPath = path.join(dataPath, folderName);
    
    // ダウンロード済みのファイルのパスを取得
    return contract.downloaded.map(fileName => path.join(contractPath, fileName));
  }

  /**
   * アップロードが必要な契約を取得
   * @returns アップロードが必要な契約の配列
   */
  getContractsToUpload(): DownloadResult[] {
    return this.history.filter(contract =>
      !contract.uploaded || // アップロード情報がない
      contract.uploaded.some(upload => upload.status === 'failed') // 失敗したアップロードがある
    );
  }
  
  /**
   * ダウンロード履歴を保存
   */
  saveHistory(): void {
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
      systemLogger.info('ダウンロード履歴を保存しました');
    } catch (err) {
      errorLogger.error('履歴ファイルの保存に失敗しました', err);
    }
  }
  
  /**
   * ダウンロード済みの契約IDリストを取得
   * @returns ダウンロード済みの契約IDリスト
   */
  getDownloadedContractIds(): string[] {
    return this.history.map(item => item.contractId);
  }
}