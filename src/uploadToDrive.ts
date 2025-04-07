import { config } from './config';
import { systemLogger, errorLogger } from './logger';
import { FileManager } from './services/fileManager';
import { HistoryManager } from './services/historyManager';
import { GoogleDriveService } from './services/googleDriveService';

/**
 * 既存のダウンロード済みファイルをGoogle Driveにアップロード
 * 既にダウンロードされているが、まだアップロードされていないファイルをアップロードする
 */
async function uploadExistingFiles() {
  try {
    // Google Driveサービスの初期化
    if (!config.googleDrive.uploadEnabled) {
      systemLogger.info('Google Driveへのアップロードが無効になっています');
      return;
    }

    // 各サービスの初期化
    const fileManager = new FileManager();
    const historyManager = new HistoryManager();
    const googleDriveService = new GoogleDriveService(config.googleDrive);
    
    systemLogger.info('Google Driveへの既存ファイルのアップロードを開始します');
    
    // アップロードが必要な契約を取得
    const contractsToUpload = historyManager.getContractsToUpload();
    
    if (contractsToUpload.length === 0) {
      systemLogger.info('アップロードが必要な契約はありません');
      return;
    }
    
    systemLogger.info(`${contractsToUpload.length}件の契約をアップロードします`);
    
    // 各契約のファイルをアップロード
    for (const contract of contractsToUpload) {
      // アップロードするファイルのパスを取得
      const filePaths = historyManager.getFilesToUpload(contract.contractId, fileManager.getDataPath());
      
      if (filePaths.length === 0) {
        systemLogger.warn(`契約 ${contract.contractId} にアップロードするファイルがありません`);
        continue;
      }
      
      systemLogger.info(`契約 ${contract.contractId} の ${filePaths.length} 件のファイルをアップロードします`);
      
      // Google Driveへのアップロード
      const results = await googleDriveService.uploadContractFiles(
        contract.contractId,
        contract.contractName,
        contract.sectionName,
        filePaths
      );
      
      // アップロード結果を履歴に追加
      historyManager.addUploadResults(contract.contractId, results);
      
      // アップロード結果のログ出力
      const successCount = results.filter(r => r.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'failed').length;
      systemLogger.info(`Google Driveへのアップロード結果: 成功=${successCount}, 失敗=${failedCount}`);
    }
    
    // 履歴の保存
    historyManager.saveHistory();
    
    systemLogger.info('既存ファイルのアップロードが完了しました');
  } catch (error) {
    errorLogger.error('既存ファイルのアップロード中にエラーが発生しました:', error);
  }
}

// スクリプトの実行
uploadExistingFiles().catch(error => {
  errorLogger.error('未処理のエラー:', error);
  process.exit(1);
});
