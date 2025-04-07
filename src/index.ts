import { chromium, Browser } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';
import { Contract } from './types';
import { config, launchOptions, executionPath } from './config';
import { systemLogger, errorLogger } from './logger';
import { sendGmail } from './mail';
import { BrowserService } from './services/browserService';
import { DownloaderService } from './services/downloaderService';
import { FileManager } from './services/fileManager';
import { HistoryManager } from './services/historyManager';

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
    
    // メイン処理の実行
    await runDownloader(browserService, fileManager, historyManager);
  } catch (error) {
    errorLogger.error('致命的なエラー:', error);
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
  historyManager: HistoryManager
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
    
    // メール送信
    if (config.mail.sendEmailEnabled) {
      const today = new Date().toLocaleDateString();
      const subject = `岩手県入札情報DL結果(${today})`;
      const text = "新規ダウンロードはありませんでした\n\n";
      await sendGmail(subject, text);
    }
    
    return;
  }
  
  // メール本文の初期化
  const today = new Date().toLocaleDateString();
  let emailText = `${today}のダウンロード結果\n\n`;
  
  // 各契約のPDFをダウンロード
  for (const contract of filteredContracts) {
    systemLogger.info(`案件: ${contract.contractName} (${contract.contractId})`);
    
    // 契約詳細ページへの移動
    await browserService.navigateToContractDetail(frame, contract.linkArg);
    
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
  
  // メール送信
  if (config.mail.sendEmailEnabled) {
    const subject = `岩手県入札情報DL結果(${today})`;
    await sendGmail(subject, emailText);
  }
}

// アプリケーションの実行
main().catch(error => {
  errorLogger.error('未処理のエラー:', error);
  process.exit(1);
});