/**
 * 入札情報ダウンローダーの通知機能
 * HTTPリクエストを受け取り、GmailとGoogle Chatに通知を転送する
 */

// スクリプトプロパティから設定を取得
const CONFIG = {
  // 認証用APIキー（クライアントからのリクエストを検証するため）
  API_KEY: PropertiesService.getScriptProperties().getProperty('API_KEY'),
  // Google ChatのウェブフックURL
  CHAT_WEBHOOK_URL: PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK_URL'),
  // 通知先メールアドレス（複数の場合はカンマ区切り）
  NOTIFICATION_EMAIL: PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL'),
  // アプリ名
  APP_NAME: '入札情報ダウンローダー'
};

/**
 * Webアプリとして公開した際のエンドポイント
 * HTTPリクエストを処理する
 * @param {Object} e - イベントオブジェクト
 * @returns {Object} レスポンス
 */
function doPost(e) {
  try {
    // リクエストデータの取得
    const requestData = JSON.parse(e.postData.contents);
    
    // APIキーの検証
    if (!validateApiKey(requestData.apiKey)) {
      return createErrorResponse('無効なAPIキーです', 401);
    }
    
    // 必須パラメータの検証
    if (!requestData.subject || !requestData.text) {
      return createErrorResponse('件名と本文は必須です', 400);
    }
    
    // 通知の送信
    const result = sendNotifications(requestData.subject, requestData.text);
    
    // 成功レスポンスの返却
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '通知が送信されました',
      details: result
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // エラーログの記録
    console.error('通知処理中にエラーが発生しました:', error);
    
    // エラーレスポンスの返却
    return createErrorResponse(`エラーが発生しました: ${error.message}`, 500);
  }
}

/**
 * APIキーを検証する
 * @param {string} apiKey - 検証するAPIキー
 * @returns {boolean} 有効なAPIキーかどうか
 */
function validateApiKey(apiKey) {
  return apiKey === CONFIG.API_KEY;
}

/**
 * エラーレスポンスを作成する
 * @param {string} message - エラーメッセージ
 * @param {number} statusCode - HTTPステータスコード
 * @returns {Object} エラーレスポンス
 */
function createErrorResponse(message, statusCode) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: message,
    statusCode: statusCode
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 通知を送信する（メールとGoogle Chat両方）
 * @param {string} subject - 通知の件名
 * @param {string} text - 通知の本文
 * @returns {Object} 送信結果
 */
function sendNotifications(subject, text) {
  const result = {
    email: { sent: false },
    chat: { sent: false }
  };
  
  // メール通知の送信
  try {
    if (CONFIG.NOTIFICATION_EMAIL) {
      sendEmailNotification(subject, text);
      result.email = { sent: true };
    } else {
      result.email = { sent: false, reason: '通知先メールアドレスが設定されていません' };
    }
  } catch (error) {
    result.email = { sent: false, error: error.message };
    console.error('メール通知の送信に失敗しました:', error);
  }
  
  // Google Chat通知の送信
  try {
    if (CONFIG.CHAT_WEBHOOK_URL) {
      sendChatNotification(subject, text);
      result.chat = { sent: true };
    } else {
      result.chat = { sent: false, reason: 'Google ChatのウェブフックURLが設定されていません' };
    }
  } catch (error) {
    result.chat = { sent: false, error: error.message };
    console.error('Google Chat通知の送信に失敗しました:', error);
  }
  
  return result;
}

/**
 * メール通知を送信する
 * @param {string} subject - メールの件名
 * @param {string} body - メールの本文
 * @returns {void}
 */
function sendEmailNotification(subject, body) {
  // 本文をHTML形式に変換（改行をBRタグに変換）
  const htmlBody = body.replace(/\n/g, '<br>');
  
  // メールオプションの設定
  const emailOptions = {
    name: CONFIG.APP_NAME,
    to: CONFIG.NOTIFICATION_EMAIL,
    subject: `[${CONFIG.APP_NAME}] ${subject}`,
    htmlBody: htmlBody
  };
  
  // メール送信
  MailApp.sendEmail(emailOptions);
  console.log(`メール通知を送信しました: ${subject}`);
}

/**
 * Google Chat通知を送信する
 * @param {string} title - 通知のタイトル
 * @param {string} text - 通知の本文
 * @returns {void}
 */
function sendChatNotification(title, text) {
  // カードの作成
  const card = {
    cards: [
      {
        header: {
          title: CONFIG.APP_NAME,
          subtitle: new Date().toLocaleString('ja-JP'),
          imageUrl: 'https://www.gstatic.com/images/branding/product/2x/apps_script_48dp.png'
        },
        sections: [
          {
            widgets: [
              {
                keyValue: {
                  topLabel: '通知',
                  content: title,
                  contentMultiline: false,
                  bottomLabel: text,
                  icon: 'DESCRIPTION'
                }
              }
            ]
          }
        ]
      }
    ]
  };
  
  // Google Chatに通知を送信
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(card)
  };
  
  const response = UrlFetchApp.fetch(CONFIG.CHAT_WEBHOOK_URL, options);
  console.log(`Google Chat通知を送信しました: ${title} (ステータス: ${response.getResponseCode()})`);
}

/**
 * テスト用の関数
 * スクリプトエディタから実行してテストする
 */
function testNotification() {
  const testSubject = 'テスト通知';
  const testText = '入札情報ダウンローダーからのテスト通知です。\n\nこれはテストメッセージです。';
  
  const result = sendNotifications(testSubject, testText);
  console.log('テスト通知の結果:', result);
}

/**
 * スクリプトプロパティを設定するための関数
 * スクリプトエディタから実行して初期設定を行う
 */
function setupScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // 設定値の入力
  const apiKey = Browser.inputBox('APIキーを入力してください', Browser.Buttons.OK_CANCEL);
  if (apiKey === 'cancel') return;
  
  const chatWebhookUrl = Browser.inputBox('Google ChatのウェブフックURLを入力してください（任意）', Browser.Buttons.OK_CANCEL);
  if (chatWebhookUrl === 'cancel') return;
  
  const notificationEmail = Browser.inputBox('通知先メールアドレスを入力してください（任意、複数の場合はカンマ区切り）', Browser.Buttons.OK_CANCEL);
  if (notificationEmail === 'cancel') return;
  
  // スクリプトプロパティの設定
  scriptProperties.setProperty('API_KEY', apiKey);
  if (chatWebhookUrl && chatWebhookUrl !== '') {
    scriptProperties.setProperty('CHAT_WEBHOOK_URL', chatWebhookUrl);
  }
  if (notificationEmail && notificationEmail !== '') {
    scriptProperties.setProperty('NOTIFICATION_EMAIL', notificationEmail);
  }
  
  Browser.msgBox('スクリプトプロパティの設定が完了しました');
}