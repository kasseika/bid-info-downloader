import * as fs from 'fs';
import * as path from 'path';
import { DownloadResult } from '../types';
import { executionPath } from '../config';
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
    this.historyPath = path.join(executionPath, 'downloadHistory.json');
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