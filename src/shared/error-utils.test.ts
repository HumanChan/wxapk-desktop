import assert from 'node:assert/strict';
import test from 'node:test';

import { extractErrorMessage, formatScanError } from './error-utils';

test('extractErrorMessage removes Electron invoke wrapper', () => {
  const error = new Error(
    "Error invoking remote method 'wxapkg:scan-default-root': Error: EPERM: operation not permitted, scandir '/tmp/demo'",
  );

  assert.equal(
    extractErrorMessage(error),
    "EPERM: operation not permitted, scandir '/tmp/demo'",
  );
});

test('formatScanError expands macOS WeChat permission guidance', () => {
  const error = new Error(
    "Error invoking remote method 'wxapkg:scan-default-root': Error: EPERM: operation not permitted, scandir '/Users/demo/Library/Containers/com.tencent.xinWeChat/Data/Documents/app_data/radium/users'",
  );

  assert.deepEqual(formatScanError(error), {
    message:
      'macOS 拒绝访问微信默认缓存目录。请在“系统设置 > 隐私与安全性 > 完全磁盘访问权限”中允许本应用，或手动选择微信的 users / packages 目录后重试。',
    suggestManualPick: true,
  });
});

test('formatScanError preserves unrelated messages', () => {
  const error = new Error('No .wxapkg files found in /tmp/input');

  assert.deepEqual(formatScanError(error), {
    message: 'No .wxapkg files found in /tmp/input',
    suggestManualPick: false,
  });
});
