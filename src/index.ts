import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';

import { IPC_CHANNELS } from './shared/channels';
import { APP_PROTOCOL, DEFAULT_SCAN_ROOT } from './shared/constants';
import type { JobEvent, ScanEntry, UnpackRequest, WorkerRequest, WorkerResponse } from './shared/types';
import { IconRegistry } from './main/icon-registry';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
    scheme: APP_PROTOCOL,
  },
]);

const iconRegistry = new IconRegistry();
const activeJobs = new Map<string, { sender: WebContents; worker: Worker }>();
const cancelledJobs = new Set<string>();
const rendererRoot = path.resolve(__dirname, '../renderer');
const isDev = !app.isPackaged;
const CSP_HEADER = [
  "default-src 'self' app: data: blob:",
  "img-src 'self' app: data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function contentTypeForFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.gif':
      return 'image/gif';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.ico':
      return 'image/x-icon';
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function isTrustedSender(senderUrl: string): boolean {
  if (!senderUrl) {
    return false;
  }

  return (
    senderUrl.startsWith(`${APP_PROTOCOL}://bundle/`) ||
    (isDev && senderUrl.startsWith('http://localhost:'))
  );
}

function assertTrustedSender(senderUrl: string): void {
  if (!isTrustedSender(senderUrl)) {
    throw new Error(`Blocked IPC request from untrusted sender: ${senderUrl}`);
  }
}

function createTextResponse(status: number, text: string): Response {
  return new Response(text, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
    status,
  });
}

function ensureWithinRoot(rootDir: string, targetPath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(targetPath);
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error('Blocked path outside allowed root');
  }

  return resolvedPath;
}

function resolveBundlePath(requestPathname: string): string {
  const cleaned = requestPathname.replace(/^\/+/, '') || 'main_window/index.html';
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid bundle asset path');
  }

  return ensureWithinRoot(rendererRoot, path.join(rendererRoot, ...parts));
}

async function fileResponse(
  filePath: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const buffer = await fs.readFile(filePath);
  return new Response(buffer, {
    headers: {
      'content-type': contentTypeForFile(filePath),
      ...extraHeaders,
    },
    status: 200,
  });
}

async function handleAppProtocol(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);

  try {
    if (requestUrl.hostname === 'bundle') {
      const assetPath = resolveBundlePath(requestUrl.pathname);
      const headers =
        path.extname(assetPath).toLowerCase() === '.html'
          ? { 'content-security-policy': CSP_HEADER }
          : undefined;
      return await fileResponse(assetPath, headers);
    }

    if (requestUrl.hostname === 'icon') {
      const token = requestUrl.pathname.replace(/^\/+/, '');
      const iconPath = iconRegistry.resolve(token);
      if (!iconPath) {
        return createTextResponse(404, 'Icon not found');
      }

      return await fileResponse(iconPath);
    }
  } catch (error) {
    return createTextResponse(
      500,
      error instanceof Error ? error.message : 'Protocol error',
    );
  }

  return createTextResponse(404, 'Not found');
}

function attachIconUrls(entries: ScanEntry[]): ScanEntry[] {
  return entries.map((entry) => {
    if (!entry.iconPath) {
      return entry;
    }

    const token = iconRegistry.register(entry.iconPath);
    return {
      ...entry,
      iconUrl: token ? `${APP_PROTOCOL}://icon/${token}` : null,
    };
  });
}

function createWorkerThread(): Worker {
  return new Worker(path.join(__dirname, 'worker.js'));
}

function senderWindow(sender: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender);
}

async function runWorkerTask(message: WorkerRequest): Promise<ScanEntry[]> {
  const worker = createWorkerThread();

  return await new Promise<ScanEntry[]>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      worker.removeAllListeners();
    };

    worker.on('message', (payload: WorkerResponse) => {
      if (payload.kind === 'scan-result') {
        settled = true;
        cleanup();
        resolve(payload.entries);
        return;
      }

      if (payload.kind === 'error') {
        settled = true;
        cleanup();
        reject(new Error(payload.message));
      }
    });

    worker.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    });

    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        cleanup();
        reject(
          new Error(
            `\u5de5\u4f5c\u7ebf\u7a0b\u5f02\u5e38\u9000\u51fa\uff0c\u4ee3\u7801 ${code}`,
          ),
        );
      }
    });

    worker.postMessage(message);
  });
}

function forwardJobEvent(sender: WebContents, event: JobEvent): void {
  if (!sender.isDestroyed()) {
    sender.send(IPC_CHANNELS.jobEvent, event);
  }
}

function cleanupJob(jobId: string): void {
  const active = activeJobs.get(jobId);
  if (!active) {
    return;
  }

  active.worker.removeAllListeners();
  activeJobs.delete(jobId);
}

function spawnUnpackJob(sender: WebContents, request: UnpackRequest): void {
  if (activeJobs.has(request.jobId)) {
    throw new Error(`Job ${request.jobId} is already running`);
  }

  const worker = createWorkerThread();
  activeJobs.set(request.jobId, { sender, worker });

  worker.on('message', (payload: WorkerResponse) => {
    if (payload.kind === 'job-event') {
      forwardJobEvent(sender, payload.event);
      return;
    }

    if (payload.kind === 'unpack-result') {
      cleanupJob(payload.jobId);
      return;
    }

    if (payload.kind === 'error') {
      cleanupJob(payload.jobId ?? request.jobId);
      forwardJobEvent(
        sender,
        {
          jobId: payload.jobId ?? request.jobId,
          message: payload.message,
          payload: {
            error: payload.message,
          },
          progress: 0,
          type: 'error',
        },
      );
    }
  });

  worker.on('error', (error: Error) => {
    cleanupJob(request.jobId);
    forwardJobEvent(sender, {
      jobId: request.jobId,
      message: error.message,
      payload: {
        error: error.message,
      },
      progress: 0,
      type: 'error',
    });
  });

  worker.on('exit', (code) => {
    if (cancelledJobs.delete(request.jobId)) {
      cleanupJob(request.jobId);
      return;
    }

    if (activeJobs.has(request.jobId) && code !== 0) {
      cleanupJob(request.jobId);
      forwardJobEvent(sender, {
        jobId: request.jobId,
        message: `\u5de5\u4f5c\u7ebf\u7a0b\u5f02\u5e38\u9000\u51fa\uff0c\u4ee3\u7801 ${code}`,
        payload: {
          error: `\u5de5\u4f5c\u7ebf\u7a0b\u5f02\u5e38\u9000\u51fa\uff0c\u4ee3\u7801 ${code}`,
        },
        progress: 0,
        type: 'error',
      });
    }
  });

  worker.postMessage({
    kind: 'unpack',
    request,
  } satisfies WorkerRequest);
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: '#081018',
    height: 900,
    minHeight: 720,
    minWidth: 1180,
    show: false,
    title: 'wxapkg \u89e3\u5305\u5de5\u5177',
    width: 1480,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedSender(targetUrl)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  } else {
    void mainWindow.loadURL(`${APP_PROTOCOL}://bundle/main_window/index.html`);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const [jobId, active] of activeJobs) {
    cancelledJobs.add(jobId);
    void active.worker.terminate();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

void app.whenReady().then(async () => {
  await protocol.handle(APP_PROTOCOL, handleAppProtocol);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  createWindow();
});

ipcMain.handle(IPC_CHANNELS.scanDefaultRoot, async (event) => {
  assertTrustedSender(event.senderFrame?.url ?? '');
  const entries = await runWorkerTask({
    kind: 'scan-root',
    root: DEFAULT_SCAN_ROOT,
  });
  return attachIconUrls(entries);
});

ipcMain.handle(IPC_CHANNELS.pickInput, async (event) => {
  assertTrustedSender(event.senderFrame?.url ?? '');
  const options: OpenDialogOptions = {
    filters: [
      {
        extensions: ['wxapkg'],
        name: 'wxapkg \u6587\u4ef6',
      },
    ],
    properties: ['openDirectory', 'openFile'],
    title: '\u9009\u62e9\u5c0f\u7a0b\u5e8f\u76ee\u5f55\u6216 .wxapkg \u6587\u4ef6',
  };
  const parentWindow = senderWindow(event.sender);
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const entries = await runWorkerTask({
    inputPath: result.filePaths[0],
    kind: 'scan-input',
  });
  return attachIconUrls(entries);
});

ipcMain.handle(IPC_CHANNELS.pickOutputDir, async (event) => {
  assertTrustedSender(event.senderFrame?.url ?? '');
  const options: OpenDialogOptions = {
    properties: ['createDirectory', 'openDirectory'],
    title: '\u9009\u62e9\u89e3\u5305\u8f93\u51fa\u76ee\u5f55',
  };
  const parentWindow = senderWindow(event.sender);
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle(IPC_CHANNELS.openPath, async (event, targetPath: string) => {
  assertTrustedSender(event.senderFrame?.url ?? '');
  return shell.openPath(targetPath);
});

ipcMain.handle(IPC_CHANNELS.startUnpack, async (event, request: UnpackRequest) => {
  assertTrustedSender(event.senderFrame?.url ?? '');
  spawnUnpackJob(event.sender, request);
});

ipcMain.handle(IPC_CHANNELS.cancelJob, async (event, jobId: string) => {
  assertTrustedSender(event.senderFrame?.url ?? '');
  const active = activeJobs.get(jobId);
  if (!active) {
    return;
  }

  cancelledJobs.add(jobId);
  cleanupJob(jobId);
  await active.worker.terminate();
  cancelledJobs.delete(jobId);
  forwardJobEvent(active.sender, {
    jobId,
    message: '\u4efb\u52a1\u5df2\u53d6\u6d88',
    progress: 0,
    type: 'cancelled',
  });
});
