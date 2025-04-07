import { Frame } from 'playwright-core';
import { systemLogger, errorLogger } from './logger';

/**
 * 契約詳細情報を取得する
 * @param frame メインフレーム
 * @param contract 契約情報
 */
export async function getContractDetails(frame: Frame, contract: any): Promise<void> {
  try {
    systemLogger.info(`契約情報を取得中: ${contract.contractName} (${contract.contractId})`);
    
    // テーブルから情報を取得
    await extractTableInfo(frame, contract);
    
    systemLogger.info(`契約情報の取得が完了しました: ${contract.contractName}`);
  } catch (error) {
    errorLogger.error(`契約詳細情報の取得中にエラーが発生しました: ${contract.contractId}`, error);
  }
}

/**
 * テーブルから情報を抽出する
 */
async function extractTableInfo(frame: Frame, contract: any): Promise<void> {
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
      return;
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
    
  } catch (error) {
    errorLogger.error(`${contract.contractId}: テーブル情報の抽出中にエラーが発生しました`, error);
  }
}