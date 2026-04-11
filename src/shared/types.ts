export interface PackageEntry {
  mtimeMs: number;
  path: string;
  size: number;
}

export type ScanEntrySource = 'default-scan' | 'manual';
export type ScanEntryInputKind = 'appDir' | 'packageFile';

export interface ScanEntry {
  appDir: string;
  iconPath: string | null;
  iconUrl: string | null;
  id: string;
  inputKind: ScanEntryInputKind;
  packageFile: string | null;
  packagesRoot: string | null;
  source: ScanEntrySource;
  userId: string | null;
  userRoot: string | null;
  wxapkgFiles: PackageEntry[];
  wxid: string | null;
}

export interface UnpackRequest {
  appDir?: string;
  beautify: boolean;
  jobId: string;
  outputDir: string;
  packageFile?: string;
  wxid: string;
}

export type JobEventType =
  | 'started'
  | 'log'
  | 'progress'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface JobEvent {
  jobId: string;
  message: string;
  payload?: {
    error?: string;
    fileCount?: number;
    outputDir?: string;
    processedFiles?: number;
    totalFiles?: number;
  };
  progress: number;
  type: JobEventType;
}

export type WorkerRequest =
  | {
      inputPath: string;
      kind: 'scan-input';
    }
  | {
      kind: 'scan-root';
      root: string;
    }
  | {
      kind: 'unpack';
      request: UnpackRequest;
    };

export type WorkerResponse =
  | {
      entries: ScanEntry[];
      kind: 'scan-result';
    }
  | {
      event: JobEvent;
      kind: 'job-event';
    }
  | {
      fileCount: number;
      jobId: string;
      kind: 'unpack-result';
      outputDir: string;
    }
  | {
      jobId?: string;
      kind: 'error';
      message: string;
    };

export interface WxapkgDesktopApi {
  cancelJob(jobId: string): Promise<void>;
  openPath(targetPath: string): Promise<string>;
  pickInput(): Promise<ScanEntry[]>;
  pickOutputDir(): Promise<string | null>;
  scanDefaultRoot(): Promise<ScanEntry[]>;
  startUnpack(request: UnpackRequest): Promise<void>;
  subscribeJobEvents(listener: (event: JobEvent) => void): () => void;
}
