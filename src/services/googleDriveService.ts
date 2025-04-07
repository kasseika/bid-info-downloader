import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleDriveConfig, UploadResult, UploadStatus, ContractDetails } from '../types';
import { errorLogger, systemLogger } from '../logger';
import { JWT } from 'google-auth-library';

/**
 * Google Driveサービス
 * Google Driveへのアップロード機能を提供
 */
export class GoogleDriveService {
  private drive;
  private sheets;
  private config: GoogleDriveConfig;

  /**
   * コンストラクタ
   * Google Drive APIクライアントを初期化
   * @param config Google Drive設定
   */
  constructor(config: GoogleDriveConfig) {
    this.config = config;

    // サービスアカウントを使用してGoogle Drive APIクライアントを初期化
    let auth: JWT;

    try {
      // サービスアカウント認証
      systemLogger.info('サービスアカウントを使用してGoogle Driveに接続します');
      
      // サービスアカウントのキーファイルを読み込む
      if (!fs.existsSync(this.config.serviceAccountKeyPath)) {
        throw new Error(`サービスアカウントキーファイルが見つかりません: ${this.config.serviceAccountKeyPath}`);
      }
      
      const keyFile = JSON.parse(fs.readFileSync(this.config.serviceAccountKeyPath, 'utf8'));
      auth = new google.auth.JWT(
        keyFile.client_email,
        undefined,
        keyFile.private_key,
        ['https://www.googleapis.com/auth/drive']
      );
    } catch (error) {
      errorLogger.error('サービスアカウント認証の初期化に失敗しました', error);
      throw new Error('サービスアカウント認証の初期化に失敗しました: ' + (error as Error).message);
    }
this.drive = google.drive({ version: 'v3', auth });
this.sheets = google.sheets({ version: 'v4', auth });
}


  /**
   * ファイルをGoogle Driveにアップロード
   * @param filePath アップロードするファイルのパス
   * @param parentFolderId 親フォルダID（指定しない場合はconfig.folderIdを使用）
   * @returns アップロード結果
   */
  async uploadFile(filePath: string, parentFolderId?: string): Promise<UploadResult> {
    const fileName = path.basename(filePath);
    const folderId = parentFolderId || this.config.folderId;

    try {
      // ファイルが存在するか確認
      if (!fs.existsSync(filePath)) {
        return {
          fileName,
          status: 'failed',
          error: 'File not found'
        };
      }

      // ファイルをアップロード
      const response = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          body: fs.createReadStream(filePath)
        },
        fields: 'id',
        supportsAllDrives: true // 共有ドライブをサポート
      });

      const fileId = response.data.id || undefined;
      systemLogger.info(`ファイル "${fileName}" をGoogle Driveにアップロードしました (ID: ${fileId})`);

      return {
        fileName,
        fileId,
        status: 'success'
      };
    } catch (error: unknown) {
      errorLogger.error(`ファイル "${fileName}" のアップロードに失敗しました`, error);
      
      return {
        fileName,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * フォルダを作成
   * @param folderName フォルダ名
   * @param parentFolderId 親フォルダID（指定しない場合はconfig.folderIdを使用）
   * @returns 作成したフォルダのID
   */
  async createFolder(folderName: string, parentFolderId?: string): Promise<string | null> {
    const folderId = parentFolderId || this.config.folderId;

    try {
      // フォルダが既に存在するか確認
      const existingFolder = await this.findFolder(folderName, folderId);
      if (existingFolder) {
        systemLogger.info(`フォルダ "${folderName}" は既に存在します (ID: ${existingFolder})`);
        return existingFolder;
      }

      // フォルダを作成
      const response = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [folderId]
        },
        fields: 'id',
        supportsAllDrives: true // 共有ドライブをサポート
      });

      const newFolderId = response.data.id || null;
      systemLogger.info(`フォルダ "${folderName}" を作成しました (ID: ${newFolderId})`);
      return newFolderId;
    } catch (error) {
      errorLogger.error(`フォルダ "${folderName}" の作成に失敗しました`, error);
      return null;
    }
  }

  /**
   * フォルダを検索
   * @param folderName フォルダ名
   * @param parentFolderId 親フォルダID
   * @returns フォルダID（存在しない場合はnull）
   */
  async findFolder(folderName: string, parentFolderId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id || null;
      }

      return null;
    } catch (error) {
      errorLogger.error(`フォルダ "${folderName}" の検索に失敗しました`, error);
      return null;
    }
  }

  /**
   * フォルダのURLを取得
   * @param folderId フォルダID
   * @returns フォルダのURL
   */
  getFolderUrl(folderId: string): string {
    return `https://drive.google.com/drive/folders/${folderId}`;
  }

  /**
   * 契約IDに対応するフォルダを作成
   * @param contractId 契約ID
   * @param contractName 契約名
   * @param sectionName セクション名
   * @returns 作成したフォルダのID
   */
  async createContractFolder(contractId: string, contractName: string, sectionName: string): Promise<string | null> {
    const folderName = `${contractId}_${contractName}_${sectionName}`;
    return await this.createFolder(folderName);
  }

  /**
   * 契約フォルダにPDFファイルをアップロード
   * @param contractId 契約ID
   * @param contractName 契約名
   * @param sectionName セクション名
   * @param filePaths アップロードするファイルのパスの配列
   * @returns アップロード結果の配列
   */
  async uploadContractFiles(
    contractId: string,
    contractName: string,
    sectionName: string,
    filePaths: string[]
  ): Promise<UploadResult[]> {
    // 契約フォルダを作成
    const folderId = await this.createContractFolder(contractId, contractName, sectionName);
    if (!folderId) {
      return filePaths.map(filePath => ({
        fileName: path.basename(filePath),
        status: 'failed',
        error: 'Failed to create contract folder'
      }));
    }

    // ファイルをアップロード
    const uploadPromises = filePaths.map(filePath => this.uploadFile(filePath, folderId));
    return await Promise.all(uploadPromises);
  }

  /**
   * スプレッドシートに契約情報を書き込む
   * @param spreadsheetId スプレッドシートID
   * @param sheetName シート名
   * @param contractDetails 契約詳細情報
   * @returns 書き込み結果（成功時はtrue、失敗時はfalse）
   */
  async writeContractToSheet(
    spreadsheetId: string,
    sheetName: string,
    contractDetails: ContractDetails
  ): Promise<boolean> {
    try {
      // スプレッドシートの列構造に合わせてデータを整形
      const rowData = [
        contractDetails.年度 || '',
        contractDetails.業務名 || '',
        contractDetails.業務名 || '', // 業務名が2列あるため同じ値を入れる
        contractDetails.契約管理番号 || '',
        contractDetails.入札方式 || '',
        contractDetails.業種 || '',
        contractDetails.業務場所 || '',
        contractDetails.業務内容 || '',
        contractDetails.公開日 || '',
        contractDetails.参加受付開始 || '',
        contractDetails.参加受付期限 || '',
        contractDetails.入札締切日時 || '',
        contractDetails.開札日 || '',
        contractDetails.予定価格 || '',
        contractDetails.発注等級 || '',
        contractDetails.WTO条件付一般競争入札方式の型 || '',
        contractDetails.備考 || '',
        contractDetails.課所名 || '',
        contractDetails.公告資料 || '' // S列に公告資料のリンクを追加
      ];

      // 契約管理番号で重複チェック
      const contractId = contractDetails.契約管理番号;
      if (!contractId) {
        systemLogger.warn('契約管理番号がないため、スプレッドシートへの書き込みをスキップします');
        return false;
      }

      // スプレッドシートからデータを取得して重複チェック
      const existingData = await this.getSheetData(spreadsheetId, sheetName);
      const duplicateRow = existingData.findIndex(row => row[3] === contractId); // D列（インデックス3）が契約管理番号

      if (duplicateRow !== -1) {
        systemLogger.info(`契約管理番号 ${contractId} は既にスプレッドシートに存在します（行: ${duplicateRow + 1}）`);
        
        // 既存の行を更新
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A${duplicateRow + 1}:S${duplicateRow + 1}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [rowData]
          }
        });
        
        systemLogger.info(`契約管理番号 ${contractId} の情報を更新しました`);
        return true;
      }

      // 新しい行を追加
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:S`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [rowData]
        }
      });

      systemLogger.info(`契約管理番号 ${contractId} の情報をスプレッドシートに追加しました`);
      return true;
    } catch (error) {
      errorLogger.error('スプレッドシートへの書き込みに失敗しました', error);
      return false;
    }
  }

  /**
   * スプレッドシートのデータを取得
   * @param spreadsheetId スプレッドシートID
   * @param sheetName シート名
   * @returns スプレッドシートのデータ
   */
  private async getSheetData(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:S`
      });

      return response.data.values || [];
    } catch (error) {
      errorLogger.error('スプレッドシートのデータ取得に失敗しました', error);
      return [];
    }
  }
}