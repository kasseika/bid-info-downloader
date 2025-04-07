import * as fs from 'fs';
import * as path from 'path';
import { FailedDownload, DownloadResult } from '../types';
import { systemLogger } from '../logger';

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
}