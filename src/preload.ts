import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from './shared/channels';
import type {
  JobEvent,
  OutputTreeResult,
  ScanEntry,
  ScanRootSelection,
  UnpackRequest,
  WxapkgDesktopApi,
} from './shared/types';

const api: WxapkgDesktopApi = {
  cancelJob(jobId: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.cancelJob, jobId);
  },
  getDefaultScanRoot() {
    return ipcRenderer.invoke(IPC_CHANNELS.getDefaultScanRoot) as Promise<string>;
  },
  openPath(targetPath: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.openPath, targetPath);
  },
  pickInput() {
    return ipcRenderer.invoke(IPC_CHANNELS.pickInput) as Promise<ScanEntry[]>;
  },
  pickOutputDir() {
    return ipcRenderer.invoke(IPC_CHANNELS.pickOutputDir) as Promise<string | null>;
  },
  pickScanRoot() {
    return ipcRenderer.invoke(IPC_CHANNELS.pickScanRoot) as Promise<ScanRootSelection | null>;
  },
  readOutputTree(targetPath: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.readOutputTree, targetPath) as Promise<OutputTreeResult>;
  },
  scanRoot(rootPath: string) {
    return ipcRenderer.invoke(IPC_CHANNELS.scanRoot, rootPath) as Promise<ScanEntry[]>;
  },
  scanDefaultRoot() {
    return ipcRenderer.invoke(IPC_CHANNELS.scanDefaultRoot) as Promise<ScanEntry[]>;
  },
  startUnpack(request: UnpackRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.startUnpack, request);
  },
  subscribeJobEvents(listener: (event: JobEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: JobEvent) => {
      listener(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.jobEvent, handler);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.jobEvent, handler);
    };
  },
};

contextBridge.exposeInMainWorld('wxapkg', api);
