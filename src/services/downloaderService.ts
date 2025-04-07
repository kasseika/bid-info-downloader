import { Page, Frame } from 'playwright-core';
import * as path from 'path';
import { PdfFile, DownloadFiles } from '../types';
import { config } from '../config';
import { systemLogger, errorLogger } from '../logger';
import { sleep } from '../utils/helpers';

/**
 * ダウンロードサービス
 * PDFファイルのダウンロード処理を担当
 */
export class DownloaderService {
  private page: Page;
  private downloadTimeout: number;
  
  /**
   * コンストラクタ
   * @param page Playwrightのページインスタンス
   */
  constructor(page: Page) {
    this.page = page;
    // ダウンロードタイムアウトは最低10秒
    this.downloadTimeout = Math.max(config.downloadTimeoutSec * 1000, 10000);
  }
  
  /**
   * PDFファイルをダウンロード
   * @param frame メインフレーム
   * @param pdfs ダウンロード対象のPDFファイルリスト
   * @param downloadPath ダウンロード先ディレクトリ
   * @returns ダウンロード結果
   */
  async downloadPdfs(frame: Frame, pdfs: PdfFile[], downloadPath: string): Promise<DownloadFiles> {
    const downloaded: string[] = [];
    const notDownloaded: string[] = [];
    
    // ダウンロード対象のPDFをフィルタリング
    const downloadTargets = pdfs.filter(pdf => pdf.enableDownload);
    const downloadNum = downloadTargets.length;
    
    if (downloadNum === 0) {
      systemLogger.info('ダウンロード対象のPDFがありません');
      // ダウンロード対象外のPDFをnotDownloadedに追加
      pdfs.forEach(pdf => {
        if (!pdf.enableDownload) {
          notDownloaded.push(pdf.fileName);
        }
      });
      return { downloaded, notDownloaded };
    }
    
    systemLogger.info(`ダウンロード対象のPDF: ${downloadNum}件`);
    
    // ダウンロードプロミスの配列
    const downloadPromises: Promise<void>[] = [];
    
    // 各PDFをダウンロード
    for (const pdf of pdfs) {
      if (pdf.enableDownload) {
        // キーワードが含まれるPDFはダウンロードする
        const selector: string = `a[href="${pdf.href}"]`;
        await frame.waitForSelector(selector);
        
        // このPDFのダウンロードプロミスを作成
        const downloadPromise = this.downloadSinglePdf(frame, selector, downloadPath, downloaded);
        downloadPromises.push(downloadPromise);
        
        // クリック間隔を設定
        const delayTime = config.pdfClickDelaySec > 0 ? config.pdfClickDelaySec * 1000 : 1000;
        await sleep(delayTime);
      } else {
        // キーワードが含まれないPDFはダウンロードしない
        notDownloaded.push(pdf.fileName);
      }
    }
    
    // すべてのダウンロードが完了するか、タイムアウトするまで待機
    if (downloadPromises.length > 0) {
      let downloadFailedTimer: NodeJS.Timeout | undefined;
      
      try {
        await Promise.race([
          Promise.all(downloadPromises),
          new Promise<void>((_, reject) => {
            downloadFailedTimer = setTimeout(() => {
              reject(new Error("ダウンロードがタイムアウトしました"));
            }, this.downloadTimeout);
          }),
        ]);
        
        systemLogger.info('すべてのダウンロードが完了しました');
      } catch (error) {
        errorLogger.error('ダウンロードタイムアウトまたはエラー', error);
      } finally {
        if (downloadFailedTimer) clearTimeout(downloadFailedTimer);
      }
    }
    
    return { downloaded, notDownloaded };
  }
  
  /**
   * 単一のPDFファイルをダウンロード
   * @param frame メインフレーム
   * @param selector PDFリンクのセレクタ
   * @param downloadPath ダウンロード先ディレクトリ
   * @param downloaded ダウンロード済みファイル名リスト（参照渡し）
   * @returns ダウンロード完了を示すPromise
   */
  private async downloadSinglePdf(
    frame: Frame,
    selector: string,
    downloadPath: string,
    downloaded: string[]
  ): Promise<void> {
    try {
      // ダウンロードイベントを待機
      const downloadPromise = this.page.waitForEvent('download');
      
      // PDFリンクをクリック
      await frame.click(selector);
      
      // ダウンロードの開始を待機
      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      systemLogger.info(`ダウンロード開始: ${fileName}`);
      
      // ファイルの保存先を設定
      const filePath = path.join(downloadPath, fileName);
      
      // ダウンロードが完了するまで待機し、ファイルを保存
      await download.saveAs(filePath);
      
      systemLogger.info(`ダウンロード完了: ${fileName}`);
      downloaded.push(fileName);
    } catch (error) {
      errorLogger.error('PDFのダウンロードに失敗しました', error);
    }
  }
}