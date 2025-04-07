import { Frame } from 'playwright-core';
import { systemLogger, errorLogger } from './logger';
import { ContractDetails } from './types';
import { GoogleDriveService } from './services/googleDriveService';
import { config } from './config';

/**
 * 契約詳細情報を取得する
 * @param frame メインフレーム
 * @param contract 契約情報
 */
export async function getContractDetails(frame: Frame, contract: any): Promise<ContractDetails | null> {
  try {
    systemLogger.info(`契約情報を取得中: ${contract.contractName} (${contract.contractId})`);
    
    // テーブルから情報を取得
    const contractDetails = await extractTableInfo(frame, contract);
    
    // スプレッドシートに書き込み
    if (contractDetails && config.googleDrive.uploadEnabled) {
      await writeToSpreadsheet(contractDetails);
    }
    
    systemLogger.info(`契約情報の取得が完了しました: ${contract.contractName}`);
    return contractDetails;
  } catch (error) {
    errorLogger.error(`契約詳細情報の取得中にエラーが発生しました: ${contract.contractId}`, error);
    return null;
  }
}

/**
 * 契約情報をスプレッドシートに書き込む
 * @param contractDetails 契約詳細情報
 */
async function writeToSpreadsheet(contractDetails: ContractDetails): Promise<void> {
  try {
    systemLogger.info('契約情報をスプレッドシートに書き込みます');
    
    // Google Driveサービスの初期化
    const googleDriveService = new GoogleDriveService(config.googleDrive);
    
    // スプレッドシートIDを取得
    const spreadsheetId = config.googleDrive.spreadsheetId;
    
    if (!spreadsheetId) {
      systemLogger.warn('スプレッドシートIDが設定されていません');
      return;
    }
    
    // 注意: フォルダの作成はここでは行わず、PDFアップロード時に行う
    // フォルダURLの設定はindex.tsのrunDownloader関数内で行う
    
    // masterシートに書き込み
    const result = await googleDriveService.writeContractToSheet(
      spreadsheetId,
      'master',
      contractDetails
    );
    
    if (result) {
      systemLogger.info('スプレッドシートへの書き込みが完了しました');
    } else {
      systemLogger.warn('スプレッドシートへの書き込みに失敗しました');
    }
  } catch (error) {
    errorLogger.error('スプレッドシートへの書き込み中にエラーが発生しました', error);
  }
}

/**
 * テーブルから情報を抽出する
 */
async function extractTableInfo(frame: Frame, contract: any): Promise<ContractDetails | null> {
  try {
    // テーブル情報を取得
    const tableInfo = await frame.evaluate(() => {
      // table.html5TableBorder.left > tbody の中のtrを取得
      const table = document.querySelector('table.html5TableBorder.left tbody');
      console.log('table', table);
      if (!table) {
        console.error('テーブルが見つかりません');
        return null
      };
      
      const rows = table.querySelectorAll('tr');
      const result: Record<string, string> = {};
      
      rows.forEach(row => {
        const titleCell = row.querySelector('td.TableTitle');
        if (!titleCell) return;
        
        const title = titleCell.textContent?.trim() || '';
        // 「入札公告等ファイル」で始まるものは除外
        if (title.startsWith('入札公告等ファイル')) return;
        
        const valueCell = row.querySelector('td.TableTitle + td');
        const value = valueCell?.textContent?.trim() || '';
        
        result[title] = value.startsWith('var sMoney') ? '*********' : value; // jsの変数名が含まれている場合はマスク
      });
      
      return result;
    });
    
    if (!tableInfo) {
      systemLogger.info(`${contract.contractId}: テーブル情報が見つかりませんでした`);
      return null;
    }
    
    // ContractDetails型に変換
    const contractDetails: ContractDetails = {
      契約管理番号: contract.contractId,
      業務名: contract.contractName,
      課所名: contract.sectionName,
      公開日: contract.releaseDate
    };
    
    // テーブル情報からContractDetailsに変換
    for (const [key, value] of Object.entries(tableInfo)) {
      // コンソールに出力して確認
      console.log(`${key}: ${value}`);
      
      switch (key) {
        case '年度':
          contractDetails.年度 = value;
          break;
        case '業務名':
          contractDetails.業務名 = value;
          break;
        case '入札方式':
          contractDetails.入札方式 = value;
          break;
        case '業種':
          contractDetails.業種 = value;
          break;
        case '業務場所':
          contractDetails.業務場所 = value;
          break;
        case '業務内容':
          contractDetails.業務内容 = value;
          break;
        case '参加受付開始':
          contractDetails.参加受付開始 = value;
          break;
        case '参加受付期限':
          contractDetails.参加受付期限 = value;
          break;
        case '入札締切日時':
          contractDetails.入札締切日時 = value;
          break;
        case '開札日':
          contractDetails.開札日 = value;
          break;
        case '予定価格(税抜)':
          contractDetails.予定価格 = value;
          break;
        case '発注等級':
          contractDetails.発注等級 = value;
          break;
        case 'ＷＴＯ・条件付一般競争入札方式の型':
          contractDetails.WTO条件付一般競争入札方式の型 = value;
          break;
        case '備考':
          contractDetails.備考 = value;
          break;
      }
    }
    
    // コンソールに情報を表示
    console.log('='.repeat(50));
    console.log(`契約ID: ${contract.contractId}`);
    console.log(`契約名: ${contract.contractName}`);
    console.log('='.repeat(50));
    
    for (const [key, value] of Object.entries(tableInfo)) {
      console.log(`${key}: ${value}`);
    }
    
    console.log('='.repeat(50));
    console.log('\n');
    
    return contractDetails;
  } catch (error) {
    errorLogger.error(`${contract.contractId}: テーブル情報の抽出中にエラーが発生しました`, error);
    return null;
  }
}