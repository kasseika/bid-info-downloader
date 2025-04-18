import * as path from 'path';
import * as fs from 'fs';
import * as toml from 'toml';
import { LaunchOptions } from 'playwright-core';
import { Config } from './types';
import { stringToBoolean } from './utils/helpers';

/**
 * Playwrightのlaunch オプション
 */
const launchOptions: LaunchOptions = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-features=site-per-process',
    '--window-size=1280,882'
  ]
};

/**
 * 実行パスの取得
 * exeとnodeで実行パスを変える
 */
// 実行パスの取得（exeの場合）とプロジェクトルートパスの取得
const executionPath = path.resolve(process.pkg ? path.dirname(process.execPath) : __dirname);
// プロジェクトのルートディレクトリを取得
const rootPath = process.cwd();

/**
 * 設定ファイルの読み込み
 */
let config: Config;
try {
  // 設定ファイルを読み込む
  const rawConfig = toml.parse(fs.readFileSync(path.join(rootPath, 'config.toml'), 'utf8'));
  
  // 型変換を行う
  config = {
    ...rawConfig,
    // 文字列で記述した場合にbool値に変換する
    downloadOnlyNew: stringToBoolean(rawConfig.downloadOnlyNew),
    fileCheckEnabled: stringToBoolean(rawConfig.fileCheckEnabled),
    notification: rawConfig.notification ? {
      ...rawConfig.notification,
      enabled: stringToBoolean(rawConfig.notification.enabled)
    } : {
      enabled: false,
      gasUrl: '',
      apiKey: ''
    },
    googleDrive: rawConfig.googleDrive ? {
      ...rawConfig.googleDrive,
      uploadEnabled: stringToBoolean(rawConfig.googleDrive.uploadEnabled)
    } : {
      uploadEnabled: false,
      serviceAccountKeyPath: '',
      folderId: '',
      spreadsheetId: ''
    },
    dataCleanup: rawConfig.dataCleanup ? {
      ...rawConfig.dataCleanup,
      enabled: stringToBoolean(rawConfig.dataCleanup.enabled),
      retentionDays: Number(rawConfig.dataCleanup.retentionDays) || 3
    } : {
      enabled: true,
      retentionDays: 3
    }
  } as Config;
  
  // 表示件数の値が不正なときに100をセット
  const itemNumbers = [10, 25, 50, 100];
  if (!itemNumbers.includes(config.numberOfItems)) {
    console.log('表示件数の設定が不正です。10, 25, 50, 100のいずれかで数値を設定する必要があります');
    console.log('表示件数を100に設定しました');
    config.numberOfItems = 100; // 100を設定
  }
} catch (error) {
  console.log('config.tomlファイルなし、デフォルト設定をロード');
  config = {
    topPage: "https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620060006600600",
    pdfKeywords: [
      "公告",
      "位置図",
      "図面",
      "参考資料",
      "平面図"
    ],
    projectTitle: "設計",
    downloadOnlyNew: true,
    numberOfItems: 100,
    fileCheckEnabled: false,
    downloadTimeoutSec: 30,
    pdfClickDelaySec: 3,
    notification: {
      enabled: false,
      gasUrl: "",
      apiKey: ""
    },
    googleDrive: {
      uploadEnabled: false,
      serviceAccountKeyPath: '',
      folderId: '',
      spreadsheetId: ''
    },
    debug: {
      debugEnabled: false,
      headless: true
    },
    dataCleanup: {
      enabled: true,
      retentionDays: 3
    }
  };
}

export { launchOptions, executionPath, rootPath, config };