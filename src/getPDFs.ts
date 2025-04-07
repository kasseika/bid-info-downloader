import { chromium, Browser, Page, Frame, Download } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import { launchOptions, executionPath, config } from './config';
import { systemLogger, errorLogger } from './logger';
import { sendGmail } from './mail';

// Create data directory if it doesn't exist
const dataPath = path.join(executionPath, 'data');
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

const topPage: string = config.topPage; // 岩手県入札情報公開トップページ
const pdfKeywords: string[] = config.pdfKeywords; // このキーワードを含むPDFをダウンロードする
const projectTitle: string = config.projectTitle; // この業務名を含むものに絞る
let downloadTimeout: number = config.downloadTimeoutSec * 1000;
if (downloadTimeout < 10000) {
  downloadTimeout = 10000;
  console.log('ダウンロード待ち時間が短すぎます。10秒に設定しました。');
}
console.log('業務名「' + projectTitle + '」を含む案件から、「' + pdfKeywords.join(', ') + '」をタイトルに含むPDFをダウンロードします');

// sleep関数
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ダウンロード失敗ファイル型定義
type failedDownload = {
  contractId: string;
  contractName: string;
  sectionName: string; // 後付で追加された
  fileName: string;
}

// ダウンロードPDFをチェックする関数
const checkFiles = async (downloadHistory: DownloadEvent[]): Promise<failedDownload[]> => {
  // ダウンロード履歴を参照して存在していないファイルがあるプロジェクトのリストを返す
  const failedDownloads: failedDownload[] = [];
  let failedDownloadsText: string = '';
  downloadHistory.forEach(contract => {
    const contractId: string = contract.contractId;
    const contractName: string = contract.contractName;
    const sectionName: string = contract.sectionName || '';
    const dataPath: string = path.join(executionPath, 'data');
    //ファイルとディレクトリのリストが格納される(配列)
    const files = fs.readdirSync(dataPath);
    //ディレクトリのリストに絞る
    const dirList = files.filter((file) => {
      return fs.statSync(path.join(dataPath, file)).isDirectory();
    });
    const folderName = dirList.find(dirName => dirName.startsWith(contractId));
    if (!folderName) {
      console.log(`Folder for contract ${contractId} not found`);
      return;
    }
    const downloadPath: string = path.join(dataPath, folderName);
    for (let i = 0; i < contract.downloaded.length; i++) {
      const fileName = contract.downloaded[i];
      const pdfPath = path.join(downloadPath, fileName);
      const pdfExists: boolean = fs.existsSync(pdfPath);
      if (!pdfExists) {
        console.log('not exist:' + pdfPath);
        failedDownloads.push({ contractId, contractName, sectionName, fileName });
        failedDownloadsText += `${contractName}(${contractId}) - ${fileName}\n`;
      }
    }
  });
  
  if (failedDownloads.length === 0) {
    console.log('ダウンロードが正常に終了しました。');
  } else {
    console.log('以下のファイルがダウンロードに失敗した可能性があります。');
    console.table(failedDownloads);
    text += '以下のファイルがダウンロードに失敗した可能性があります。\n';
    text += failedDownloadsText;
  }
  return failedDownloads;
};

/*
  ダウンロード履歴用
*/

type DownloadEvent = {
  contractId: string;
  contractName: string;
  sectionName?: string;
  downloaded: string[];
  notDownloaded: string[];
};

let downloadHistory: DownloadEvent[] = [];

try {
  downloadHistory = JSON.parse(fs.readFileSync(path.join(executionPath, 'downloadHistory.json'), 'utf8'));
} catch (err: any) {
  if (err.code === 'ENOENT') {
    console.log('downloadHistory.jsonを作成');
  } else {
    errorLogger.error(err);
  }
}

/*
  メール送信設定
*/

const today: string = new Date().toLocaleDateString(); // 今日の日付
const subject: string = `岩手県入札情報DL結果(${today})`;
let text: string = "";

/*
  ダウンローダー本体
*/

const getPDFs = async (browser: Browser): Promise<void> => {
  process.on('unhandledRejection', (reason) => {
    errorLogger.error(reason);
  });
  
  // Create a new page
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent': 'bot' });
  page.setDefaultTimeout(90000); // 遷移のタイムアウトを90秒に変更

  // Navigate to the top page
  const response = await page.goto(topPage, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    errorLogger.error('入札情報公開サービスに接続できませんでした');
    return;
  }

  // Handle dialogs (alerts, confirms, etc.)
  page.on('dialog', async dialog => {
    /* 無指定検索時の確認をOKにする */
    await dialog.accept(); // OK
  });

  // トップメニュー > コンサルをクリック
  await Promise.all([
    page.waitForNavigation(),
    page.click('[onclick="jsLink2(2);"]')
  ]);

  // Find the right frame
  const frameHandle = await page.waitForSelector('frame[name="frmRIGHT"]');
  const frame = await frameHandle.contentFrame();
  if (!frame) {
    throw new Error("frmRIGHT frame not found");
  }

  // 入札情報の閲覧 > 発注情報の検索をクリック 
  await Promise.all([
    frame.waitForNavigation(),
    frame.click('[onclick="jskfcLink(4);"]')
  ]);

  // 発注情報検索: 表示件数を1ページ100件に
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
  console.log('案件表示件数:', config.numberOfItems);
  console.log('案件ごとのダウンロードタイムアウト時間:', config.downloadTimeoutSec, '秒');
  console.log('各PDFクリックディレイ:', config.pdfClickDelaySec, '秒');
  console.log('ファイルチェック:', config.fileCheckEnabled);

  // 発注情報検索: 業務名を入力して絞る
  await frame.fill('[name="koujimei"]', projectTitle);

  // 発注情報検索: 検索ボタンをクリック
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
  
  type Contract = {
    contractId: string;
    contractName: string;
    linkArg: string;
    releaseDate: string;
    isNew: boolean;
    sectionName: string;
  };

  // 検索結果が表示されるまで待つ
  await sleep(3000);

  const downloadContracts: Contract[] = await frame2.evaluate(() => {
    const trs = document.querySelectorAll('tr');
    const contracts: Contract[] = [];
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
        const contract: Contract = {
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

  const downloadedIdList = downloadHistory.map(contract => contract.contractId);

  console.log('Newのみをダウンロード: ', config.downloadOnlyNew);
  // NewのみをダウンロードするときはNew以外を除外
  let filteredContracts = downloadContracts;
  if (config.downloadOnlyNew) {
    filteredContracts = downloadContracts.filter(contract => contract.isNew);
  }

  // ダウンロードプロジェクトリストからダウンロード済みのプロジェクトを除外
  filteredContracts = filteredContracts.filter(contract => !downloadedIdList.includes(contract.contractId));

  if (!filteredContracts.length) {
    // ダウンロードするものがない場合は終了
    systemLogger.info('新規ダウンロードなし');
    text += "新規ダウンロードはありませんでした\n\n"; // メール本文
    return;
  }

  text += `${today}のダウンロード結果\n\n`; // メール本文

  // Configure download behavior
  await page.context().route('**/*.pdf', route => {
    route.continue();
  });

  // Set up download handler
  page.on('download', download => {
    console.log(`Download started: ${download.suggestedFilename()}`);
  });

  for (let i = 0; i < filteredContracts.length; i++) {
    // 業務名クリック → 発注情報閲覧へ移動
    console.log('project: ' + filteredContracts[i].contractName);
    
    // 毎回 frame を再取得する
    const frameHandle = await page.waitForSelector('frame[name="frmRIGHT"]');
    const frame = await frameHandle.contentFrame();
    if (!frame) {
      throw new Error('frmRIGHT フレームが見つかりませんでした');
    }

    // フレームの再取得後に要素を探す
    const elementHandle = await frame.waitForSelector('#frmMain');
    const frame2 = await elementHandle.contentFrame();
    if (!frame2) {
      throw new Error('frmMain のフレームが取得できませんでした');
    }

    // a[href="${filteredContracts[i].linkArg}"]が表示されるまで待つ
    await frame2.waitForSelector(`a[href="${filteredContracts[i].linkArg}"]`);
    await Promise.all([
      frame.waitForNavigation(),
      frame2.click(`a[href="${filteredContracts[i].linkArg}"]`)
    ]);

    const contractId = filteredContracts[i].contractId;
    const contractName = filteredContracts[i].contractName;
    const sectionName = filteredContracts[i].sectionName;
    const folderName: string = contractId + '_' + contractName + '_' + sectionName;
    
    // ダウンロード先の設定
    const downloadPath = path.join(executionPath, `data/${folderName}/`);
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Set download path for this page context
    const context = page.context();
    await context.tracing.start({ screenshots: true, snapshots: true });
    // Note: In Playwright, downloads are handled via events rather than setting a path directly

    type downloadPdf = {
      fileName: string;
      href: string;
      enableDownload: boolean;
    };

    const downloadPdfs: downloadPdf[] = await frame.evaluate(({ btnSelector, pdfKeywords }) => {
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

    const downloadNum = downloadPdfs.filter(downloadPdf => downloadPdf.enableDownload === true).length;
    let downloadedNum = 0;
    let downloadFailedTimer: NodeJS.Timeout;
    let downloaded: string[] = [];
    let notDownloaded: string[] = [];

    // Set up download promise
    const downloadPromises: Promise<void>[] = [];

    for (let j = 0; j < downloadPdfs.length; j++) {
      const downloadPdf = downloadPdfs[j];
      if (downloadPdf.enableDownload) {
        // キーワードが含まれるPDFはダウンロードする
        const selector: string = `a[href="${downloadPdf.href}"]`;
        await frame.waitForSelector(selector);
        
        // Create a promise for this download
        const downloadPromise = new Promise<void>(async (resolve) => {
          // Set up download event listener for this specific download
          const downloadListener = async (download: Download) => {
            const path = await download.path();
            if (path) {
              console.log('download completed: ', download.suggestedFilename());
              downloaded.push(download.suggestedFilename());
              downloadedNum += 1;
              
              // Remove this listener after download completes
              page.removeListener('download', downloadListener);
              resolve();
            }
          };
          
          // Add the listener
          page.on('download', downloadListener);
          
          // Click to start download
          await frame.click(selector);
        });
        
        downloadPromises.push(downloadPromise);
        
        // Add delay between clicks
        if (config.pdfClickDelaySec > 0) {
          await sleep(config.pdfClickDelaySec * 1000);
        } else {
          await sleep(1000);
        }
      } else {
        // キーワードが含まれないPDFはダウンロードしない
        notDownloaded.push(downloadPdf.fileName); // ダウンロード履歴にダウンロード対象外として追加
      }
    }

    // Wait for all downloads to complete or timeout
    if (downloadPromises.length > 0) {
      await Promise.race([
        Promise.all(downloadPromises),
        new Promise<void>((_, reject) => {
          downloadFailedTimer = setTimeout(() => {
            reject(new Error("download timed out"));
          }, downloadTimeout);
        }),
      ]).finally(() => {
        if (downloadFailedTimer) clearTimeout(downloadFailedTimer);
      });
    }

    // ダウンロード履歴に追加
    downloadHistory.push({
      contractId,
      contractName,
      sectionName,
      downloaded,
      notDownloaded
    });

    systemLogger.info(contractId, contractName, '\n  ダウンロード済ファイル\n    ・' + downloaded.join('\n    ・'), '\n  未ダウンロードファイル\n    ・' + notDownloaded.join('\n    ・'));

    // メール本文に結果を追記
    text += '**********************************************************************';
    text += `\n\n${contractName} (${contractId})\n`;
    text += '【DL済】\n' + downloaded.map(x => '・' + x).join('\n') + '\n';
    text += '【未DL】\n' + notDownloaded.map(x => '・' + x).join('\n') + '\n';
    text += '\n\n';

    // 戻るをクリック → 発注情報検索画面に戻る
    // input[value="戻る"]が表示されるまで待つ
    await frame.waitForSelector('input[value="戻る"]');
    await Promise.all([
      frame.waitForNavigation(),
      frame.click('input[value="戻る"]')
    ]);
  }

  fs.writeFileSync(path.join(executionPath, 'downloadHistory.json'), JSON.stringify(downloadHistory, null, 2));
};

(async () => {
  // ブラウザ立ち上げ
  let browser: Browser | undefined;
  
  try {
    const browserOptions = { ...launchOptions };
    
    if (config.debug.debugEnabled && typeof config.debug.headless === 'boolean') {
      browserOptions.headless = config.debug.headless;
    }
    
    // For Raspberry Pi, use the system's Chromium browser
    if (config.browserPath) {
      console.log('Using custom browser path:', config.browserPath);
      browserOptions.executablePath = config.browserPath;
    } else {
      // Try to detect Chromium on Raspberry Pi
      const possiblePaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
      ];
      
      for (const browserPath of possiblePaths) {
        if (fs.existsSync(browserPath)) {
          console.log(`Using browser at: ${browserPath}`);
          browserOptions.executablePath = browserPath;
          break;
        }
      }
    }
    
    browser = await chromium.launch(browserOptions);
    
    // ダウンロード実行
    await getPDFs(browser);
    
    // ファイルチェックが有効のときにファイルをチェックする
    if (config.fileCheckEnabled) await checkFiles(downloadHistory);
    
    // メール送信
    if (config.mail.sendEmailEnabled) {
      await sendGmail(subject, text);
    }
  } catch (error) {
    errorLogger.error(error);
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();