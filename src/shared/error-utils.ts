const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+':\s*/;
const GENERIC_ERROR_PREFIX = /^Error:\s*/;
const MAC_WECHAT_USERS_ROOT =
  '/Library/Containers/com.tencent.xinWeChat/Data/Documents/app_data/radium/users';

export function extractErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(IPC_ERROR_PREFIX, '')
    .replace(GENERIC_ERROR_PREFIX, '')
    .trim();
}

function isPermissionError(message: string): boolean {
  return (
    /\b(?:EPERM|EACCES)\b/.test(message) ||
    /operation not permitted/i.test(message) ||
    /permission denied/i.test(message)
  );
}

function referencesProtectedWechatRoot(message: string): boolean {
  return message.includes(MAC_WECHAT_USERS_ROOT);
}

export function formatScanError(error: unknown): {
  message: string;
  suggestManualPick: boolean;
} {
  const message = extractErrorMessage(error);

  if (isPermissionError(message) && referencesProtectedWechatRoot(message)) {
    return {
      message:
        'macOS 拒绝访问微信默认缓存目录。请在“系统设置 > 隐私与安全性 > 完全磁盘访问权限”中允许本应用，或手动选择微信的 users / packages 目录后重试。',
      suggestManualPick: true,
    };
  }

  return {
    message,
    suggestManualPick: false,
  };
}
