import { Browser, Page, Frame } from 'playwright-core';
import { Contract, PdfFile } from '../types';
import { config } from '../config';
import { systemLogger, errorLogger } from '../logger';
import { formatFileName } from '../utils/helpers';

/**
 * ブラウザ操作サービス
 * Playwrightを使用したブラウザの操作、ページの移動、要素の操作などの機能を提供
 */
export class BrowserService {
  private browser: Browser;
  private page: Page | null = null;
  private mainFrame: Frame | null = null;
  
  /**
   * コンストラクタ
   * @param browser Playwrightのブラウザインスタンス
   */
  constructor(browser: Browser) {
    this.browser = browser;
  }
  
  /**
   * ブラウザの初期化
   */
  async initialize(): Promise<void> {
    try {
      this.page = await this.browser.newPage();
      await this.page.setExtraHTTPHeaders({ 'User-Agent': 'bot' });
      this.page.setDefaultTimeout(90000); // 遷移のタイムアウトを90秒に変更
      
      // ダイアログ処理の設定
      this.page.on('dialog', async dialog => {
        /* 無指定検索時の確認をOKにする */
        await dialog.accept();
      });
      
      systemLogger.info('ブラウザを初期化しました');
    } catch (error) {
      errorLogger.error('ブラウザの初期化に失敗しました', error);
      throw error;
    }
  }
  
  /**
   * トップページに移動
   * @returns {Promise<{success: boolean, isServiceStopped: boolean}>} 接続結果とサービス停止状態
   */
  async navigateToTopPage(): Promise<{success: boolean, isServiceStopped: boolean}> {
    if (!this.page) throw new Error('ブラウザが初期化されていません');
    
    try {
      const response = await this.page.goto(config.topPage, { waitUntil: "domcontentloaded" });
      
      // レスポンスが正常かどうかを確認
      const success = !!(response && response.ok());
      
      if (success) {
        // サービス停止中かどうかを確認
        const content = await this.page.content();
        const isServiceStopped = content.includes('サービス停止中');
        
        if (isServiceStopped) {
          systemLogger.warn('入札情報公開サービスは現在停止中です');
        }
        
        return { success, isServiceStopped };
      }
      
      return { success, isServiceStopped: false };
    } catch (error) {
      errorLogger.error('トップページへの移動に失敗しました', error);
      return { success: false, isServiceStopped: false };
    }
  }
  
  /**
   * コンサルタント検索ページに移動
   * @returns メインフレーム
   */
  async navigateToConsultantSearch(): Promise<Frame> {
    if (!this.page) throw new Error('ブラウザが初期化されていません');
    
    try {
      // トップメニュー > コンサルをクリック
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('[onclick="jsLink2(2);"]')
      ]);
      
      // フレームを取得
      const frameHandle = await this.page.waitForSelector('frame[name="frmRIGHT"]');
      const frame = await frameHandle.contentFrame();
      if (!frame) throw new Error("frmRIGHT frame not found");
      
      this.mainFrame = frame;
      
      // 入札情報の閲覧 > 発注情報の検索をクリック
      await Promise.all([
        frame.waitForNavigation(),
        frame.click('[onclick="jskfcLink(4);"]')
      ]);
      
      systemLogger.info('コンサルタント検索ページに移動しました');
      return frame;
    } catch (error) {
      errorLogger.error('コンサルタント検索ページへの移動に失敗しました', error);
      throw error;
    }
  }
  
  /**
   * 検索条件を設定して検索を実行
   * @param frame メインフレーム
   * @param projectTitle 検索する業務名
   * @returns 検索結果の契約リスト
   */
  async searchContracts(frame: Frame, projectTitle: string): Promise<Contract[]> {
    try {
      // 表示件数を設定
      let numberOfItemsValue: '010' | '020' | '030' | '040';
      switch (config.numberOfItems) {
        case 10:
          numberOfItemsValue = '010';
          break;
        case 25:
          numberOfItemsValue = '020';
          break;
        case 50:
          numberOfItemsValue = '030';
          break;
        case 100:
        default:
          numberOfItemsValue = '040';
          break;
      }
      
      // select[name="A300"]が表示されるまで待つ
      await frame.waitForSelector('select[name="A300"]');
      // 表示件数を変更
      await frame.selectOption('select[name="A300"]', numberOfItemsValue);
      
      systemLogger.info(`案件表示件数: ${config.numberOfItems}`);
      systemLogger.info(`案件ごとのダウンロードタイムアウト時間: ${config.downloadTimeoutSec}秒`);
      systemLogger.info(`各PDFクリックディレイ: ${config.pdfClickDelaySec}秒`);
      systemLogger.info(`ファイルチェック: ${config.fileCheckEnabled}`);
      
      // 業務名を入力して絞る
      await frame.fill('[name="koujimei"]', projectTitle);
      
      // 検索ボタンをクリック
      await Promise.all([
        frame.waitForNavigation(),
        frame.click('[onclick="doSearch1();"]')
      ]);
      
      // 検索結果が表示されるまで待つ
      const searchResultSelector = 'table[width="800"][border="0"][cellpadding="1"][cellspacing="1"] tbody tr td[align="left"]';
      await frame.waitForSelector(searchResultSelector, { state: 'visible' });
      
      // 発注情報検索: 業務情報を取得
      const frmMainSelector = '#frmMain';
      await frame.waitForSelector(frmMainSelector, { state: 'visible' });
      const elementHandle = await frame.$(frmMainSelector);
      if (!elementHandle) {
        throw new Error("frmMainの要素が見つかりませんでした");
      }
      
      const frame2 = await elementHandle.contentFrame();
      if (!frame2) {
        throw new Error("iframeのコンテキストが取得できませんでした");
      }
      
      // 検索結果が表示されるまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 検索結果から契約情報を取得
      const contracts = await frame2.evaluate(() => {
        const trs = document.querySelectorAll('tr');
        const contracts: any[] = [];
        for (let i = 0; i < trs.length; i++) {
          const tr = trs[i];
          if (!tr.children || tr.children.length < 8) continue;
          
          const releaseDate: string = tr.children[0].textContent?.replace(/\s/g, '') || '';
          const contractName: string = tr.children[1].textContent?.replace(/\s/g, '') || '';
          const contractId: string = tr.children[2].textContent?.replace(/\s/g, '') || '';
          const linkElement = tr.children[1].firstElementChild as HTMLAnchorElement;
          const linkArg: string = linkElement ? linkElement.getAttribute('href') || '' : '';
          // 公開日に画像(New)があるものはNew
          const isNew: boolean = !!(tr.children[0].firstElementChild && tr.children[0].firstElementChild.tagName === 'IMG');
          const sectionName: string = tr.children[7].textContent?.replace(/\s/g, '') || '';
          
          if (contractId && contractName && linkArg) {
            const contract = {
              contractId,
              contractName,
              linkArg,
              releaseDate,
              isNew,
              sectionName
            };
            contracts.push(contract);
          }
        }
        return contracts;
      });
      
      systemLogger.info(`検索結果: ${contracts.length}件`);
      return contracts;
    } catch (error) {
      errorLogger.error('契約検索に失敗しました', error);
      throw error;
    }
  }
  
  /**
   * 契約詳細ページに移動
   * @param frame メインフレーム
   * @param linkArg リンク引数
   */
  async navigateToContractDetail(frame: Frame, linkArg: string): Promise<void> {
    try {
      // 毎回 frame を再取得する
      const frameHandle = await this.page!.waitForSelector('frame[name="frmRIGHT"]');
      const mainFrame = await frameHandle.contentFrame();
      if (!mainFrame) {
        throw new Error('frmRIGHT フレームが見つかりませんでした');
      }
      
      this.mainFrame = mainFrame;
      
      // フレームの再取得後に要素を探す
      const elementHandle = await mainFrame.waitForSelector('#frmMain');
      const frame2 = await elementHandle.contentFrame();
      if (!frame2) {
        throw new Error('frmMain のフレームが取得できませんでした');
      }
      
      // a[href="${linkArg}"]が表示されるまで待つ
      await frame2.waitForSelector(`a[href="${linkArg}"]`);
      await Promise.all([
        mainFrame.waitForNavigation(),
        frame2.click(`a[href="${linkArg}"]`)
      ]);
      
      systemLogger.info('契約詳細ページに移動しました');
    } catch (error) {
      errorLogger.error('契約詳細ページへの移動に失敗しました', error);
      throw error;
    }
  }
  
  /**
   * 利用可能なPDFファイルを取得
   * @param frame メインフレーム
   * @param pdfKeywords PDFのキーワード
   * @returns PDFファイルのリスト
   */
  async getAvailablePdfs(frame: Frame, pdfKeywords: string[]): Promise<PdfFile[]> {
    try {
      const pdfs = await frame.evaluate(({ btnSelector, pdfKeywords }) => {
        const links: NodeListOf<Element> = document.querySelectorAll(btnSelector);
        const downloadPdfs: any[] = Array.from(links)
          .filter(link => link.textContent && link.textContent.replace(/\s/g, '') !== '') // 空行除太郎
          .map(link => {
            const fileName: string = link.textContent!
              .replace(/[\r\n|\n|\r]/g, '') // 改行を削除
              .replace(/^\s*?(\S.*\S)\s.*?$/, '$1')  // ファイル名前後の空白を削除
              .replace(/(?<=\S) (?=\S)/, '+');  // ファイル名内部の 半角スペース を + に変更
            const href: string = link.getAttribute('href') || '';
            const enableDownload: boolean = pdfKeywords.some(keyword => fileName.includes(keyword));
            return {
              fileName,
              href,
              enableDownload
            };
          });
        
        return downloadPdfs;
      }, { btnSelector: 'a[href^="javascript:download"]', pdfKeywords });
      
      const downloadableCount = pdfs.filter(pdf => pdf.enableDownload).length;
      systemLogger.info(`ダウンロード可能なPDF: ${downloadableCount}件`);
      
      return pdfs;
    } catch (error) {
      errorLogger.error('PDFファイルの取得に失敗しました', error);
      throw error;
    }
  }
  
  /**
   * 前のページに戻る
   * @param frame メインフレーム
   */
  async navigateBack(frame: Frame): Promise<void> {
    try {
      // 戻るをクリック → 発注情報検索画面に戻る
      // input[value="戻る"]が表示されるまで待つ
      await frame.waitForSelector('input[value="戻る"]');
      await Promise.all([
        frame.waitForNavigation(),
        frame.click('input[value="戻る"]')
      ]);
      
      systemLogger.info('検索結果ページに戻りました');
    } catch (error) {
      errorLogger.error('前のページへの移動に失敗しました', error);
      throw error;
    }
  }
  
  /**
   * ページインスタンスを取得
   * @returns Playwrightのページインスタンス
   */
  getPage(): Page {
    if (!this.page) throw new Error('ブラウザが初期化されていません');
    return this.page;
  }
  
  /**
   * メインフレームを取得
   * @returns メインフレーム
   */
  getMainFrame(): Frame {
    if (!this.mainFrame) throw new Error('メインフレームが初期化されていません');
    return this.mainFrame;
  }
}