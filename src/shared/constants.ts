import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SCAN_ROOT =
  process.platform === 'darwin'
    ? path.join(
        os.homedir(),
        'Library',
        'Containers',
        'com.tencent.xinWeChat',
        'Data',
        'Documents',
        'app_data',
        'radium',
        'users',
      )
    : 'C:\\Users\\admin\\AppData\\Roaming\\Tencent\\xwechat\\radium\\users';

export const APP_PROTOCOL = 'app';

export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.ico',
]);
