import * as fs from 'fs';
import * as path from 'path';
import { FailedDownload, DownloadResult } from '../types';
import { systemLogger } from '../logger';
import { config } from '../config';

/**
 * ファイル管理サービス
 * ディレクトリの作成やファイルのチェックなどの機能を提供
 */
export class FileManager {
  private dataPath: string;
  
  /**
   * コンストラクタ
   * データディレクトリを初期化
   */
  constructor() {
    // プロジェクトのルートディレクトリに data フォルダを作成
    this.dataPath = path.join(process.cwd(), 'data');
    this.ensureDirectoryExists(this.dataPath);
  }
  
  /**
   * ディレクトリが存在することを確認し、存在しない場合は作成
   * @param dirPath ディレクトリパス
   */
  ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
  
  /**
   * 契約IDに対応するディレクトリを作成
   * @param contractId 契約ID
   * @param contractName 契約名
   * @param sectionName セクション名
   * @returns 作成したディレクトリのパス
   */
  createContractDirectory(contractId: string, contractName: string, sectionName: string): string {
    const folderName = `${contractId}_${contractName}_${sectionName}`;
    const dirPath = path.join(this.dataPath, folderName);
    this.ensureDirectoryExists(dirPath);
    return dirPath;
  }
  
  /**
   * ダウンロードされたファイルが実際に存在するかチェック
   * @param downloadHistory ダウンロード履歴
   * @returns ダウンロードに失敗したファイルのリスト
   */
  checkDownloadedFiles(downloadHistory: DownloadResult[]): FailedDownload[] {
    const failedDownloads: FailedDownload[] = [];
    
    downloadHistory.forEach(contract => {
      const { contractId, contractName, sectionName, downloaded } = contract;
      
      // 契約IDに対応するフォルダを検索
      const files = fs.readdirSync(this.dataPath);
      const dirList = files.filter(file => 
        fs.statSync(path.join(this.dataPath, file)).isDirectory()
      );
      
      const folderName = dirList.find(dirName => dirName.startsWith(contractId));
      if (!folderName) {
        systemLogger.warn(`Folder for contract ${contractId} not found`);
        return;
      }
      
      const downloadPath = path.join(this.dataPath, folderName);
      
      // ダウンロードされたはずのファイルが存在するか確認
      for (const fileName of downloaded) {
        const pdfPath = path.join(downloadPath, fileName);
        if (!fs.existsSync(pdfPath)) {
          systemLogger.warn(`File not found: ${pdfPath}`);
          failedDownloads.push({ contractId, contractName, sectionName, fileName });
        }
      }
    });
    
    return failedDownloads;
  }
  
  /**
   * データディレクトリのパスを取得
   * @returns データディレクトリのパス
   */
  getDataPath(): string {
    return this.dataPath;
  }

  /**
   * 一定期間を経過した案件のデータを削除
   * @param historyManager 履歴管理サービス
   * @returns 削除したディレクトリの数
   */
  cleanupOldData(historyManager: { getHistory: () => DownloadResult[] }): number {
    if (!config.dataCleanup.enabled) {
      systemLogger.info('データクリーンアップ機能は無効になっています');
      return 0;
    }

    const retentionDays = config.dataCleanup.retentionDays;
    systemLogger.info(`${retentionDays}日より古いデータを削除します`);

    // 現在の日時
    const now = new Date();
    // 保持期間（ミリ秒）
    const retentionPeriod = retentionDays * 24 * 60 * 60 * 1000;
    // 削除基準日時
    const cutoffDate = new Date(now.getTime() - retentionPeriod);

    let deletedCount = 0;

    try {
      // ダウンロード履歴を取得
      const history = historyManager.getHistory();
      
      // dataディレクトリ内のすべてのフォルダを取得
      const files = fs.readdirSync(this.dataPath);
      const dirList = files.filter(file =>
        fs.statSync(path.join(this.dataPath, file)).isDirectory()
      );

      // 各フォルダの契約IDを取得し、履歴と照合
      for (const dirName of dirList) {
        // フォルダ名から契約IDを抽出（例: "123456_契約名_セクション名" → "123456"）
        const contractId = dirName.split('_')[0];
        const historyItem = history.find(item => item.contractId === contractId);
        
        if (historyItem && historyItem.downloadedAt) {
          // ダウンロード日時を取得
          const downloadDate = new Date(historyItem.downloadedAt);
          
          // ダウンロード日時が保持期間より古い場合は削除
          if (downloadDate < cutoffDate) {
            const dirPath = path.join(this.dataPath, dirName);
            systemLogger.info(`古いデータを削除します: ${dirName} (ダウンロード日: ${downloadDate.toLocaleDateString()})`);
            
            // ディレクトリを再帰的に削除
            fs.rmSync(dirPath, { recursive: true, force: true });
            deletedCount++;
          }
        } else {
          // 履歴に記録がない場合はファイルシステムの日時をフォールバックとして使用
          const dirPath = path.join(this.dataPath, dirName);
          const stats = fs.statSync(dirPath);
          
          if (stats.mtime < cutoffDate) {
            systemLogger.info(`履歴に記録がないデータを削除します: ${dirName} (最終更新日: ${stats.mtime.toLocaleDateString()})`);
            fs.rmSync(dirPath, { recursive: true, force: true });
            deletedCount++;
          }
        }
      }

      systemLogger.info(`${deletedCount}件の古いデータを削除しました`);
      return deletedCount;
    } catch (error) {
      systemLogger.error('データクリーンアップ中にエラーが発生しました:', error);
      return 0;
    }
  }
}