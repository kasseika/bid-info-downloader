/**
 * ヘルパー関数
 * アプリケーション全体で使用する汎用的な関数
 */

/**
 * 指定したミリ秒だけ処理を一時停止する
 * @param ms 停止するミリ秒
 * @returns Promise
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 文字列がブール値として解釈可能かチェックし、ブール値に変換する
 * @param value 変換する文字列
 * @returns ブール値
 */
export const stringToBoolean = (value: string | boolean): boolean => {
  if (typeof value === 'boolean') return value;
  return value.toLowerCase() === 'true';
};

/**
 * ファイル名から不要な文字を削除し、適切な形式に整形する
 * @param fileName 整形前のファイル名
 * @returns 整形後のファイル名
 */
export const formatFileName = (fileName: string): string => {
  return fileName
    .replace(/[\r\n|\n|\r]/g, '') // 改行を削除
    .replace(/^\s*?(\S.*\S)\s.*?$/, '$1')  // ファイル名前後の空白を削除
    .replace(/(?<=\S) (?=\S)/, '+');  // ファイル名内部の半角スペースを+に変更
};