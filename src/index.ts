import { chromium, Browser } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';
import { Contract, UploadResult } from './types';
import { config, launchOptions, executionPath } from './config';
import { systemLogger, errorLogger } from './logger';
import { sendNotification, sendErrorNotification } from './notification';
import { getContractDetails } from './getContractDetails';
import { BrowserService } from './services/browserService';
import { DownloaderService } from './services/downloaderService';
import { FileManager } from './services/fileManager';
import { HistoryManager } from './services/historyManager';
import { GoogleDriveService } from './services/googleDriveService';

/**
 * メイン処理
 * アプリケーションのエントリーポイント
 */
async function main() {
  // エラーハンドリングの設定
  process.on('unhandledRejection', (reason) => {
    errorLogger.error('未処理のPromise拒否', reason);
  });
  
  // ブラウザの起動
  let browser: Browser | undefined;
  
  try {
    // ブラウザオプションの設定
    const browserOptions = {
      ...launchOptions,
      acceptDownloads: true // ダウンロードを自動的に受け入れる
    };
    
    // デバッグモードの設定
    if (config.debug.debugEnabled && typeof config.debug.headless === 'boolean') {
      browserOptions.headless = config.debug.headless;
    }
    
    // ブラウザパスの設定
    if (config.browserPath) {
      systemLogger.info(`カスタムブラウザパスを使用: ${config.browserPath}`);
      browserOptions.executablePath = config.browserPath;
    } else {
      // Raspberry Pi用のChromiumパスを自動検出
      const possiblePaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
      ];
      
      for (const browserPath of possiblePaths) {
        if (fs.existsSync(browserPath)) {
          systemLogger.info(`ブラウザを検出: ${browserPath}`);
          browserOptions.executablePath = browserPath;
          break;
        }
      }
    }
    
    // ブラウザの起動
    browser = await chromium.launch(browserOptions);
    
    // 各サービスの初期化
    const browserService = new BrowserService(browser);
    await browserService.initialize();
    
    const fileManager = new FileManager();
    const historyManager = new HistoryManager();
    
    // Google Driveサービスの初期化（設定が有効な場合）
    let googleDriveService: GoogleDriveService | undefined;
    if (config.googleDrive.uploadEnabled) {
      googleDriveService = new GoogleDriveService(config.googleDrive);
      systemLogger.info('Google Driveサービスを初期化しました');
    }
    
    // メイン処理の実行
    await runDownloader(browserService, fileManager, historyManager, googleDriveService);
  } catch (error) {
    errorLogger.error('致命的なエラー:', error);
    // エラー通知の送信
    await sendErrorNotification('致命的なエラー', error);
  } finally {
    // ブラウザの終了
    if (browser) {
      await browser.close();
      systemLogger.info('ブラウザを終了しました');
    }
  }
}

/**
 * ダウンローダーの実行
 * @param browserService ブラウザサービス
 * @param fileManager ファイル管理サービス
 * @param historyManager 履歴管理サービス
 */
async function runDownloader(
  browserService: BrowserService,
  fileManager: FileManager,
  historyManager: HistoryManager,
  googleDriveService?: GoogleDriveService
) {
  // トップページへの移動
  const topPageSuccess = await browserService.navigateToTopPage();
  if (!topPageSuccess) {
    errorLogger.error('入札情報公開サービスに接続できませんでした');
    return;
  }
  
  // コンサルタント検索ページへの移動
  const frame = await browserService.navigateToConsultantSearch();
  
  // 検索条件の設定と検索実行
  const contracts = await browserService.searchContracts(frame, config.projectTitle);
  
  // ダウンロード済みの契約IDを取得
  const downloadedIds = historyManager.getDownloadedContractIds();
  
  // ダウンロード対象の契約をフィルタリング
  let filteredContracts = contracts;
  if (config.downloadOnlyNew) {
    filteredContracts = contracts.filter(contract => contract.isNew);
    systemLogger.info(`Newのみをダウンロード: ${filteredContracts.length}件`);
  }
  
  // ダウンロード済みの契約を除外
  filteredContracts = filteredContracts.filter(contract => !downloadedIds.includes(contract.contractId));
  
  // ダウンロード対象がない場合は終了
  if (!filteredContracts.length) {
    systemLogger.info('新規ダウンロードなし');
    
    // 通知送信
    if (config.notification.enabled) {
      const today = new Date().toLocaleDateString();
      const subject = `岩手県入札情報DL結果(${today})`;
      
      // 絞り込み条件を含めた本文の作成
      let text = "新規ダウンロードはありませんでした\n\n";
      text += "【絞り込み条件】\n";
      text += `・業務名: ${config.projectTitle ? config.projectTitle : "指定なし"}\n`;
      text += `・新着のみ: ${config.downloadOnlyNew ? "はい" : "いいえ"}\n`;
      text += `・PDFキーワード: ${config.pdfKeywords.join(", ")}\n\n`;
      
      await sendNotification(subject, text);
    }
    
    return;
  }
  
  // メール本文の初期化
  const today = new Date().toLocaleDateString();
  let emailText = `${today}のダウンロード結果\n\n`;
  
  // 絞り込み条件の追加
  emailText += "【絞り込み条件】\n";
  emailText += `・業務名: ${config.projectTitle ? config.projectTitle : "指定なし"}\n`;
  emailText += `・新着のみ: ${config.downloadOnlyNew ? "はい" : "いいえ"}\n`;
  emailText += `・PDFキーワード: ${config.pdfKeywords.join(", ")}\n\n`;
  let uploadResults: { contractId: string; results: UploadResult[]; folderId: string | null }[] = [];
  
  // 各契約のPDFをダウンロード
  for (const contract of filteredContracts) {
    systemLogger.info(`案件: ${contract.contractName} (${contract.contractId})`);
    
    // 契約詳細ページへの移動
    await browserService.navigateToContractDetail(frame, contract.linkArg);
    // 契約詳細情報を取得してコンソールに表示
    const mainFrame = browserService.getMainFrame();
    const contractDetails = await getContractDetails(mainFrame, contract);
    
    // ダウンロードディレクトリの作成
    const downloadPath = fileManager.createContractDirectory(
      contract.contractId,
      contract.contractName,
      contract.sectionName
    );
    
    // ダウンロード可能なPDFの取得
    const pdfs = await browserService.getAvailablePdfs(frame, config.pdfKeywords);
    
    // PDFのダウンロード
    const downloader = new DownloaderService(browserService.getPage());
    const downloadFiles = await downloader.downloadPdfs(frame, pdfs, downloadPath);
    
    // ダウンロード結果を履歴に追加
    const downloadResult = {
      contractId: contract.contractId,
      contractName: contract.contractName,
      sectionName: contract.sectionName,
      downloaded: downloadFiles.downloaded,
      notDownloaded: downloadFiles.notDownloaded
    };
    
    historyManager.addToHistory(downloadResult);
    
    // Google Driveへのアップロード（設定が有効な場合）
    if (googleDriveService && config.googleDrive.uploadEnabled) {
      systemLogger.info(`Google Driveへのアップロードを開始: ${contract.contractName}`);
      
      // ダウンロードしたファイルのパスを取得
      const filePaths = downloadFiles.downloaded.map(fileName =>
        path.join(downloadPath, fileName)
      );
      
      // 契約フォルダを作成し、PDFファイルをアップロード
      // まず、フォルダIDを取得
      const folderName = `${contract.contractId}_${contract.contractName}_${contract.sectionName}`;
      const folderId = await googleDriveService.createContractFolder(
        contract.contractId,
        contract.contractName,
        contract.sectionName
      );
      
      if (!folderId) {
        systemLogger.error(`契約フォルダの作成に失敗しました: ${folderName}`);
        continue;
      }
      
      // ファイルをアップロード
      const uploadPromises = filePaths.map(filePath => googleDriveService.uploadFile(filePath, folderId));
      const results = await Promise.all(uploadPromises);
      
      // アップロード結果を履歴に追加
      historyManager.addUploadResults(contract.contractId, results);
      
      // アップロード結果を記録
      uploadResults.push({ contractId: contract.contractId, results, folderId });
      
      // アップロード結果のログ出力
      const successCount = results.filter(r => r.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'failed').length;
      systemLogger.info(`Google Driveへのアップロード結果: 成功=${successCount}, 失敗=${failedCount}`);
      
      // フォルダURLをスプレッドシートに書き込む
      if (contractDetails && successCount > 0) {
        // フォルダURLを設定（作成したフォルダIDを直接使用）
        contractDetails.公告資料 = googleDriveService.getFolderUrl(folderId);
        systemLogger.info(`契約フォルダのURLを設定しました: ${contractDetails.公告資料}`);
        
        // スプレッドシートに書き込み
        const spreadsheetId = config.googleDrive.spreadsheetId;
        if (spreadsheetId) {
          const result = await googleDriveService.writeContractToSheet(
            spreadsheetId,
            'master',
            contractDetails
          );
          
          if (result) {
            systemLogger.info('フォルダURLをスプレッドシートに書き込みました');
          } else {
            systemLogger.warn('フォルダURLのスプレッドシートへの書き込みに失敗しました');
          }
        }
      }
    }
    
    // ログ出力
    systemLogger.info(
      contract.contractId,
      contract.contractName,
      '\n  ダウンロード済ファイル\n    ・' + downloadFiles.downloaded.join('\n    ・'),
      '\n  未ダウンロードファイル\n    ・' + downloadFiles.notDownloaded.join('\n    ・')
    );
    
    // メール本文に結果を追記
    emailText += '**********************************************************************';
    emailText += `\n\n${contract.contractName} (${contract.contractId})\n`;
    emailText += '【DL済】\n' + downloadFiles.downloaded.map(x => '・' + x).join('\n') + '\n';
    emailText += '【未DL】\n' + downloadFiles.notDownloaded.map(x => '・' + x).join('\n') + '\n\n';
    
    // 検索結果ページに戻る
    await browserService.navigateBack(frame);
  }
  
  // 履歴の保存
  historyManager.saveHistory();
  
  // Google Driveへのアップロード結果をメール本文に追加
  if (uploadResults.length > 0) {
    emailText += '\n\n***** Google Driveへのアップロード結果 *****\n\n';
    
    for (const { contractId, results, folderId } of uploadResults) {
      const contract = historyManager.getHistory().find(c => c.contractId === contractId);
      if (!contract) continue;
      
      emailText += `${contract.contractName} (${contractId})\n`;
      
      // フォルダURLを追加
      if (folderId && googleDriveService) {
        const folderUrl = googleDriveService.getFolderUrl(folderId);
        systemLogger.info(`通知に追加するフォルダURL: ${folderUrl}`);
        emailText += `【フォルダURL】\n${folderUrl}\n\n`;
      }
      
      const successFiles = results.filter(r => r.status === 'success');
      const failedFiles = results.filter(r => r.status === 'failed');
      
      if (successFiles.length > 0) {
        emailText += '【アップロード成功】\n' + successFiles.map(r => '・' + r.fileName).join('\n') + '\n';
      }
      
      if (failedFiles.length > 0) {
        emailText += '【アップロード失敗】\n' + failedFiles.map(r => `・${r.fileName} (${r.error})`).join('\n') + '\n';
      }
      
      emailText += '\n';
    }
  }
  
  // ファイルチェックが有効な場合は実行
  if (config.fileCheckEnabled) {
    const failedDownloads = fileManager.checkDownloadedFiles(historyManager.getHistory());
    
    if (failedDownloads.length > 0) {
      systemLogger.warn('以下のファイルがダウンロードに失敗した可能性があります');
      console.table(failedDownloads);
      
      emailText += '以下のファイルがダウンロードに失敗した可能性があります。\n';
      failedDownloads.forEach(item => {
        emailText += `${item.contractName}(${item.contractId}) - ${item.fileName}\n`;
      });
    } else {
      systemLogger.info('ダウンロードが正常に終了しました');
    }
  }
  // 通知送信
  if (config.notification.enabled) {
    const subject = `岩手県入札情報DL結果(${today})`;
    await sendNotification(subject, emailText);
  }
}

/**
 * 既存のダウンロード済みファイルをGoogle Driveにアップロード
 * 既にダウンロードされているが、まだアップロードされていないファイルをアップロードする
 */
async function uploadExistingFiles() {
  try {
    // 各サービスの初期化
    const fileManager = new FileManager();
    const historyManager = new HistoryManager();
    
    // Google Driveサービスの初期化
    if (!config.googleDrive.uploadEnabled) {
      systemLogger.info('Google Driveへのアップロードが無効になっています');
      return;
    }
    
    const googleDriveService = new GoogleDriveService(config.googleDrive);
    
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
    // エラー通知の送信
    await sendErrorNotification('既存ファイルのアップロード中にエラーが発生', error);
  }
}

// コマンドライン引数に応じて実行する関数を選択
const args = process.argv.slice(2);
if (args.includes('--upload-only')) {
  // アップロードのみ実行
  uploadExistingFiles().catch(async error => {
    errorLogger.error('未処理のエラー:', error);
    // エラー通知の送信
    await sendErrorNotification('アップロード処理中の未処理のエラー', error);
    process.exit(1);
  });
} else {
  // 通常の実行
  main().catch(async error => {
    errorLogger.error('未処理のエラー:', error);
    // エラー通知の送信
    await sendErrorNotification('メイン処理中の未処理のエラー', error);
    process.exit(1);
  });
}