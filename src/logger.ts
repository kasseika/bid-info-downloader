import * as log4js from 'log4js';
import * as path from 'path';
import { executionPath } from './config';

/*
  log出力用
*/

const logPath = path.join(executionPath, `logs/`);

// Make sure logs directory exists
import * as fs from 'fs';
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
}
if (!fs.existsSync(path.join(logPath, 'system'))) {
  fs.mkdirSync(path.join(logPath, 'system'), { recursive: true });
}
if (!fs.existsSync(path.join(logPath, 'debug'))) {
  fs.mkdirSync(path.join(logPath, 'debug'), { recursive: true });
}

log4js.configure({
  appenders: {
    stdout: { type: 'stdout' },
    system: { type: 'dateFile', filename: logPath + 'system/system', pattern: 'yyyy-MM-dd.log', alwaysIncludePattern: true },
    error: { type: 'file', filename: logPath + 'debug/error.log' },
    debug: { type: 'file', filename: logPath + 'debug/debug.log' }
  },
  categories: {
    default: { appenders: ['system', 'stdout'], level: 'info' },
    error: { appenders: ['error', 'stdout'], level: 'warn' },
    debug: { appenders: ['debug', 'stdout'], level: 'debug' }
  }
});

const systemLogger = log4js.getLogger('system');
const errorLogger = log4js.getLogger('error');
const debugLogger = log4js.getLogger('debug');

export { systemLogger, errorLogger, debugLogger };