import { systemLogger, errorLogger } from "./logger";
import { config } from "./config";

/**
 * Google Apps Scriptに通知を送信する
 * @param subject 件名
 * @param text 本文
 * @returns 送信成功したかどうか
 */
export const sendNotification = async (subject: string, text: string): Promise<boolean> => {
  if (!config.notification.enabled) {
    systemLogger.info("通知機能は無効になっています");
    return false;
  }

  try {
    // 送信データの準備
    const data = {
      apiKey: config.notification.apiKey,
      subject,
      text,
      timestamp: new Date().toISOString()
    };

    // Google Apps Scriptに送信
    const response = await fetch(config.notification.gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      systemLogger.info(`通知を送信しました: ${subject}`);
      return true;
    } else {
      errorLogger.error(`通知の送信に失敗しました: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    errorLogger.error("通知の送信中にエラーが発生しました:", error);
    return false;
  }
};

/**
 * エラーが発生した場合に通知を送信する
 * @param errorTitle エラーのタイトル
 * @param error エラーオブジェクトまたはエラーメッセージ
 * @returns 送信成功したかどうか
 */
export const sendErrorNotification = async (errorTitle: string, error: unknown): Promise<boolean> => {
  if (!config.notification.enabled) {
    systemLogger.info("通知機能は無効になっています");
    return false;
  }

  try {
    // エラーメッセージの作成
    let errorMessage = "エラーが発生しました";
    
    if (error instanceof Error) {
      errorMessage = `${error.name}: ${error.message}`;
      if (error.stack) {
        errorMessage += `\n\nスタックトレース:\n${error.stack}`;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error !== null && typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error, null, 2);
      } catch {
        errorMessage = `${error}`;
      }
    } else if (error !== undefined) {
      errorMessage = `${error}`;
    }

    // 件名の作成
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const subject = `【エラー】岩手県入札情報DL(${today}): ${errorTitle}`;
    
    // 本文の作成
    let text = `${today}にエラーが発生しました\n\n${errorTitle}\n\n${errorMessage}`;
    
    // 設定情報を追加
    try {
      const { config } = require('./config');
      text += "\n\n【実行時の設定情報】\n";
      text += `・業務名: ${config.projectTitle ? config.projectTitle : "指定なし"}\n`;
      text += `・新着のみ: ${config.downloadOnlyNew ? "はい" : "いいえ"}\n`;
      text += `・PDFキーワード: ${config.pdfKeywords.join(", ")}\n`;
    } catch (configError) {
      // 設定情報の取得に失敗した場合は追加しない
      text += "\n\n【設定情報の取得に失敗しました】\n";
    }
    
    // 通知の送信
    return await sendNotification(subject, text);
  } catch (sendError) {
    errorLogger.error("エラー通知の送信中にエラーが発生しました:", sendError);
    return false;
  }
};