import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleDriveConfig, UploadResult, UploadStatus } from '../types';
import { errorLogger, systemLogger } from '../logger';
import { JWT } from 'google-auth-library';

/**
 * Google Driveサービス
 * Google Driveへのアップロード機能を提供
 */
export class GoogleDriveService {
  private drive;
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
}