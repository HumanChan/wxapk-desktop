import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  FileArchive,
  FolderOpen,
  FolderOutput,
  ImageIcon,
  LoaderCircle,
  PackageOpen,
  Play,
  RefreshCcw,
  Search,
  Sparkles,
  Square,
} from 'lucide-react';

import { ThemeToggle } from './components/theme-toggle';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/ui/card';
import { Input } from './components/ui/input';
import { Progress } from './components/ui/progress';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { Switch } from './components/ui/switch';
import type { JobEvent, JobEventType, ScanEntry } from './shared/types';

interface LogItem {
  id: string;
  text: string;
  tone: 'default' | 'error' | 'success';
}

interface JobViewState {
  error: string | null;
  fileCount: number | null;
  id: string | null;
  message: string;
  outputDir: string | null;
  progress: number;
  running: boolean;
  type: JobEventType | 'idle';
}

const TEXT = {
  appDetail: '\u5e94\u7528\u8be6\u60c5',
  appDetailDesc:
    '\u67e5\u770b icon\u3001\u5305\u6587\u4ef6\u3001\u8def\u5f84\u548c\u89e3\u5305\u53c2\u6570',
  appsFound: '\u5df2\u53d1\u73b0\u5e94\u7528',
  appList: '\u5e94\u7528\u5217\u8868',
  appListDesc:
    '\u6309 wxid\u3001\u8def\u5f84\u6216\u7528\u6237\u76ee\u5f55\u7b5b\u9009',
  availableApps: '\u4e2a\u53ef\u89e3\u5305\u5c0f\u7a0b\u5e8f',
  beautify: '\u81ea\u52a8\u683c\u5f0f\u5316',
  beautifyDesc:
    '\u9ed8\u8ba4\u7f8e\u5316 JSON\u3001HTML\u3001JS\uff1b\u4e8c\u8fdb\u5236\u6587\u4ef6\u539f\u6837\u8f93\u51fa\u3002',
  cancel: '\u53d6\u6d88\u4efb\u52a1',
  chooseFirst:
    '\u8bf7\u5148\u9009\u62e9\u5c0f\u7a0b\u5e8f\u3001\u8f93\u51fa\u76ee\u5f55\uff0c\u5e76\u786e\u8ba4 wxid \u53ef\u7528\u3002',
  chooseOutput: '\u9009\u62e9\u8f93\u51fa\u76ee\u5f55',
  currentStatus: '\u5f53\u524d\u72b6\u6001',
  defaultDone: '\u9ed8\u8ba4\u76ee\u5f55\u626b\u63cf',
  defaultScanStart: '\u5f00\u59cb\u626b\u63cf\u9ed8\u8ba4\u76ee\u5f55',
  defaultSource: '\u9ed8\u8ba4\u626b\u63cf',
  descPrefix: '\u9ed8\u8ba4\u626b\u63cf xwechat \u7684',
  descSuffix:
    '\u76ee\u5f55\uff0c\u663e\u793a wxid\u3001icon\u3001\u5305\u6570\u91cf\uff0c\u5e76\u53ef\u76f4\u63a5\u53d1\u8d77\u89e3\u5305\u3002',
  discovered: '\u5b8c\u6210\uff0c\u5171\u53d1\u73b0',
  emptyApps: '\u5f53\u524d\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u5c0f\u7a0b\u5e8f\u8bb0\u5f55',
  emptyScanning: '\u6b63\u5728\u626b\u63cf\u76ee\u5f55\uff0c\u8bf7\u7a0d\u5019\u2026',
  fileDone: '\u5b8c\u6210\u6587\u4ef6\u6570\uff1a',
  fillWxid: '\u5f85\u8865\u5145 wxid',
  importFail: '\u5bfc\u5165\u5931\u8d25\uff1a',
  importInput: '\u5bfc\u5165\u76ee\u5f55\u6216\u5305',
  logEmpty: '\u65e5\u5fd7\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002',
  logs: '\u64cd\u4f5c\u65e5\u5fd7',
  logsDesc:
    '\u4fdd\u7559\u6700\u8fd1 150 \u6761\u8bb0\u5f55\uff0c\u4fbf\u4e8e\u56de\u770b\u626b\u63cf\u548c\u89e3\u5305\u8fc7\u7a0b',
  manualCancel: '\u5df2\u53d6\u6d88\u624b\u52a8\u5bfc\u5165',
  manualDone: '\u624b\u52a8\u5bfc\u5165',
  manualPickerOpen: '\u6253\u5f00\u624b\u52a8\u5bfc\u5165\u9009\u62e9\u5668',
  manualSource: '\u624b\u52a8\u5bfc\u5165',
  manualWxid: '\u624b\u52a8\u8f93\u5165 wxid',
  manualWxidPlaceholder: '\u4f8b\u5982 wx1234567890abcdef',
  noAppFound:
    '\u5b8c\u6210\uff0c\u672a\u53d1\u73b0\u53ef\u89e3\u5305\u7684\u5c0f\u7a0b\u5e8f',
  notGenerated: '\u5c1a\u672a\u751f\u6210',
  openOutput: '\u6253\u5f00\u8f93\u51fa\u76ee\u5f55',
  outputCard: '\u8f93\u51fa\u76ee\u5f55',
  outputLocation: '\u8f93\u51fa\u4f4d\u7f6e\uff1a',
  outputSet: '\u8f93\u51fa\u76ee\u5f55\u5df2\u8bbe\u7f6e\u4e3a',
  outputUnset: '\u5c1a\u672a\u9009\u62e9',
  overview: '\u4efb\u52a1\u6982\u89c8',
  overviewDesc:
    '\u5f53\u524d\u9009\u62e9\u3001\u4e3b\u9898\u5207\u6362\u548c\u8f93\u51fa\u72b6\u6001',
  packageCountSuffix: '\u4e2a\u5305\u6587\u4ef6',
  packageFiles: '\u5305\u6587\u4ef6\u5217\u8868',
  pendingWxid: '\u5f85\u8f93\u5165 wxid',
  scanDefault: '\u626b\u63cf\u9ed8\u8ba4\u76ee\u5f55',
  scanFail: '\u626b\u63cf\u5931\u8d25\uff1a',
  searchPlaceholder: '\u641c\u7d22 wxid / \u8def\u5f84 / \u7528\u6237\u76ee\u5f55',
  selectHint:
    '\u5148\u4ece\u5de6\u4fa7\u9009\u62e9\u4e00\u4e2a\u5c0f\u7a0b\u5e8f\uff0c\u53f3\u4fa7\u4f1a\u663e\u793a icon\u3001\u8def\u5f84\u548c\u5305\u8be6\u60c5\u3002',
  startFail: '\u542f\u52a8\u5931\u8d25\uff1a',
  startUnpack: '\u5f00\u59cb\u89e3\u5305',
  submitJob: '\u5df2\u63d0\u4ea4\u89e3\u5305\u4efb\u52a1\uff1a',
  taskStatus: '\u4efb\u52a1\u72b6\u6001',
  taskStatusDesc:
    '\u5b9e\u65f6\u67e5\u770b\u8fdb\u5ea6\u3001\u53d6\u6d88\u4efb\u52a1\u6216\u6253\u5f00\u8f93\u51fa\u76ee\u5f55',
  title: 'wxapkg \u89e3\u5305\u5de5\u5177',
  titleBadge: '\u9ed8\u8ba4\u4e2d\u6587\u754c\u9762',
  waiting: '\u7b49\u5f85\u5f00\u59cb\u89e3\u5305',
};

const ARCHIVE_ROOT_LABEL = '默认缓存目录（Windows / macOS）';

const EMPTY_JOB: JobViewState = {
  error: null,
  fileCount: null,
  id: null,
  message: TEXT.waiting,
  outputDir: null,
  progress: 0,
  running: false,
  type: 'idle',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(timestamp);
}

function statusText(type: JobViewState['type']): string {
  switch (type) {
    case 'started':
      return '\u51c6\u5907\u4e2d';
    case 'log':
      return '\u5904\u7406\u4e2d';
    case 'progress':
      return '\u89e3\u5305\u4e2d';
    case 'completed':
      return '\u5df2\u5b8c\u6210';
    case 'cancelled':
      return '\u5df2\u53d6\u6d88';
    case 'error':
      return '\u5931\u8d25';
    default:
      return '\u672a\u5f00\u59cb';
  }
}

function EntryIcon({ entry }: { entry: ScanEntry }) {
  if (entry.iconUrl) {
    return (
      <img
        alt={entry.wxid ?? 'wxapp icon'}
        className="size-14 rounded-2xl border border-border/70 object-cover shadow-sm"
        src={entry.iconUrl}
      />
    );
  }

  return (
    <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/60 text-muted-foreground">
      <ImageIcon className="size-6" />
    </div>
  );
}

export function App() {
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState('');
  const [beautify, setBeautify] = useState(true);
  const [manualWxid, setManualWxid] = useState('');
  const [keyword, setKeyword] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [job, setJob] = useState<JobViewState>(EMPTY_JOB);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());

  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;
  const filteredEntries = entries.filter((entry) => {
    if (!deferredKeyword) {
      return true;
    }

    const haystack = [
      entry.wxid,
      entry.userId,
      entry.appDir,
      entry.wxapkgFiles.map((item) => item.path).join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(deferredKeyword);
  });

  const resolvedWxid = selectedEntry?.wxid ?? manualWxid.trim();
  const canStart = Boolean(selectedEntry && outputDir.trim() && resolvedWxid && !job.running);

  function pushLog(text: string, tone: LogItem['tone'] = 'default'): void {
    setLogs((current) => [...current.slice(-149), { id: crypto.randomUUID(), text, tone }]);
  }

  function applyEntries(nextEntries: ScanEntry[], source: string): void {
    startTransition(() => {
      setEntries(nextEntries);
      setSelectedId((current) =>
        nextEntries.some((entry) => entry.id === current)
          ? current
          : (nextEntries[0]?.id ?? null),
      );
    });

    setScanError(null);
    pushLog(
      nextEntries.length > 0
        ? `${source}${TEXT.discovered} ${nextEntries.length} ${TEXT.availableApps}`
        : `${source}${TEXT.noAppFound}`,
      'success',
    );
  }

  async function scanDefaultRoot(): Promise<void> {
    setIsScanning(true);
    setScanError(null);
    pushLog(TEXT.defaultScanStart);

    try {
      applyEntries(await window.wxapkg.scanDefaultRoot(), TEXT.defaultDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setScanError(`${TEXT.scanFail}${message}`);
      pushLog(`${TEXT.scanFail}${message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  }

  async function importInput(): Promise<void> {
    setIsScanning(true);
    setScanError(null);
    pushLog(TEXT.manualPickerOpen);

    try {
      const nextEntries = await window.wxapkg.pickInput();
      if (nextEntries.length === 0) {
        pushLog(TEXT.manualCancel);
        return;
      }

      applyEntries(nextEntries, TEXT.manualDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setScanError(`${TEXT.importFail}${message}`);
      pushLog(`${TEXT.importFail}${message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  }

  async function chooseOutputDir(): Promise<void> {
    const nextOutputDir = await window.wxapkg.pickOutputDir();
    if (!nextOutputDir) {
      return;
    }

    setOutputDir(nextOutputDir);
    pushLog(`${TEXT.outputSet} ${nextOutputDir}`);
  }

  async function startUnpack(): Promise<void> {
    if (!selectedEntry || !outputDir.trim() || !resolvedWxid) {
      setScanError(TEXT.chooseFirst);
      return;
    }

    const jobId = crypto.randomUUID();
    setJob({
      ...EMPTY_JOB,
      id: jobId,
      message: `${TEXT.submitJob}${resolvedWxid}`,
      running: true,
      type: 'started',
    });
    pushLog(`${TEXT.submitJob}${resolvedWxid}`);

    try {
      await window.wxapkg.startUnpack({
        appDir: selectedEntry.inputKind === 'appDir' ? selectedEntry.appDir : undefined,
        beautify,
        jobId,
        outputDir: outputDir.trim(),
        packageFile:
          selectedEntry.inputKind === 'packageFile'
            ? (selectedEntry.packageFile ?? undefined)
            : undefined,
        wxid: resolvedWxid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJob({ ...EMPTY_JOB, error: message, id: jobId, message, type: 'error' });
      pushLog(`${TEXT.startFail}${message}`, 'error');
    }
  }

  async function cancelJob(): Promise<void> {
    if (!job.id || !job.running) {
      return;
    }

    await window.wxapkg.cancelJob(job.id);
  }

  useEffect(() => {
    void scanDefaultRoot();
  }, []);

  useEffect(() => {
    if (!selectedEntry?.wxid) {
      setManualWxid('');
    }
  }, [selectedEntry?.id, selectedEntry?.wxid]);

  useEffect(() => {
    return window.wxapkg.subscribeJobEvents((event: JobEvent) => {
      setJob((current) => {
        if (current.id && current.id !== event.jobId) {
          return current;
        }

        return {
          error: event.type === 'error' ? (event.payload?.error ?? event.message) : null,
          fileCount: event.payload?.fileCount ?? current.fileCount,
          id: event.jobId,
          message: event.message,
          outputDir: event.payload?.outputDir ?? current.outputDir,
          progress: Math.round(event.progress * 100),
          running: !['completed', 'cancelled', 'error'].includes(event.type),
          type: event.type,
        };
      });

      pushLog(
        `${statusText(event.type)}: ${event.message}`,
        event.type === 'error' ? 'error' : event.type === 'completed' ? 'success' : 'default',
      );
    });
  }, []);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-4 md:p-6 xl:p-8">
        <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="border-primary/15 bg-card/85 shadow-lg backdrop-blur">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <Badge className="w-fit gap-1 rounded-full px-3 py-1" variant="secondary">
                    <Sparkles className="size-3.5" />
                    {TEXT.titleBadge}
                  </Badge>
                  <div className="space-y-2">
                    <CardTitle className="text-3xl font-semibold tracking-tight">
                      {TEXT.title}
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-6">
                      {TEXT.descPrefix}
                      <span className="mx-1 font-mono text-xs">{ARCHIVE_ROOT_LABEL}</span>
                      {TEXT.descSuffix}
                    </CardDescription>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Button
                className="justify-start"
                onClick={() => void scanDefaultRoot()}
                type="button"
              >
                {isScanning ? <LoaderCircle className="animate-spin" /> : <RefreshCcw />}
                {TEXT.scanDefault}
              </Button>
              <Button
                className="justify-start"
                onClick={() => void importInput()}
                type="button"
                variant="secondary"
              >
                <FolderOpen />
                {TEXT.importInput}
              </Button>
              <Button
                className="justify-start"
                onClick={() => void chooseOutputDir()}
                type="button"
                variant="outline"
              >
                <FolderOutput />
                {TEXT.chooseOutput}
              </Button>
              <Button
                className="justify-start"
                disabled={!canStart}
                onClick={() => void startUnpack()}
                type="button"
              >
                <Play />
                {TEXT.startUnpack}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 shadow-lg backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">{TEXT.overview}</CardTitle>
              <CardDescription>{TEXT.overviewDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
                <span className="text-muted-foreground">{TEXT.appsFound}</span>
                <span className="text-lg font-semibold">{entries.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
                <span className="text-muted-foreground">{TEXT.currentStatus}</span>
                <Badge
                  variant={
                    job.type === 'error'
                      ? 'destructive'
                      : job.type === 'completed'
                        ? 'default'
                        : 'secondary'
                  }
                >
                  {statusText(job.type)}
                </Badge>
              </div>
              <div className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-xs leading-6 text-muted-foreground">
                {TEXT.outputCard}
                {': '}
                {outputDir || TEXT.outputUnset}
              </div>
            </CardContent>
          </Card>
        </header>

        <div className="grid flex-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="border-border/70 bg-card/88 shadow-lg backdrop-blur">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{TEXT.appList}</CardTitle>
                  <CardDescription>{TEXT.appListDesc}</CardDescription>
                </div>
                <Badge variant="outline">{filteredEntries.length}</Badge>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={TEXT.searchPlaceholder}
                  value={keyword}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[52vh] xl:h-[calc(100vh-19rem)]">
                <div className="space-y-3 pr-3">
                  {filteredEntries.map((entry) => {
                    const active = entry.id === selectedEntry?.id;
                    return (
                      <button
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          active
                            ? 'border-primary/60 bg-primary/8 shadow-sm'
                            : 'border-border/70 bg-background/70 hover:border-primary/30 hover:bg-muted/50'
                        }`}
                        key={entry.id}
                        onClick={() => setSelectedId(entry.id)}
                        type="button"
                      >
                        <div className="flex gap-3">
                          <EntryIcon entry={entry} />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate font-medium">
                                {entry.wxid ?? TEXT.pendingWxid}
                              </div>
                              <Badge
                                variant={
                                  entry.source === 'default-scan' ? 'secondary' : 'outline'
                                }
                              >
                                {entry.source === 'default-scan'
                                  ? TEXT.defaultSource
                                  : TEXT.manualSource}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {entry.wxapkgFiles.length} {TEXT.packageCountSuffix}
                            </div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {entry.appDir}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredEntries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                      {isScanning ? TEXT.emptyScanning : TEXT.emptyApps}
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="border-border/70 bg-card/88 shadow-lg backdrop-blur">
              <CardHeader>
                <CardTitle className="text-base">{TEXT.appDetail}</CardTitle>
                <CardDescription>{TEXT.appDetailDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {selectedEntry ? (
                  <>
                    <div className="flex flex-col gap-4 rounded-3xl bg-muted/40 p-4 sm:flex-row sm:items-center">
                      <EntryIcon entry={selectedEntry} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-xl font-semibold">
                            {selectedEntry.wxid ?? TEXT.fillWxid}
                          </div>
                          <Badge variant="outline">
                            {selectedEntry.wxapkgFiles.length} {'\u4e2a\u5305'}
                          </Badge>
                          {selectedEntry.userId ? (
                            <Badge variant="secondary">{selectedEntry.userId}</Badge>
                          ) : null}
                        </div>
                        <div className="break-all text-xs leading-6 text-muted-foreground">
                          {selectedEntry.appDir}
                        </div>
                      </div>
                    </div>

                    {!selectedEntry.wxid ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{TEXT.manualWxid}</div>
                        <Input
                          onChange={(event) => setManualWxid(event.target.value)}
                          placeholder={TEXT.manualWxidPlaceholder}
                          value={manualWxid}
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 p-4 text-sm">
                        <div className="mb-2 text-muted-foreground">{TEXT.outputCard}</div>
                        <div className="break-all font-mono text-xs leading-6">
                          {outputDir || TEXT.outputUnset}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/70 p-4 text-sm">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-muted-foreground">{TEXT.beautify}</span>
                          <Switch checked={beautify} onCheckedChange={setBeautify} />
                        </div>
                        <div className="text-xs leading-6 text-muted-foreground">
                          {TEXT.beautifyDesc}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{TEXT.packageFiles}</div>
                        <Badge variant="outline">{selectedEntry.wxapkgFiles.length}</Badge>
                      </div>
                      <ScrollArea className="h-[280px] rounded-2xl border border-border/70">
                        <div className="space-y-3 p-4">
                          {selectedEntry.wxapkgFiles.map((item) => (
                            <div className="rounded-2xl bg-muted/45 p-3" key={item.path}>
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <FileArchive className="size-4" />
                                <span className="truncate">
                                  {item.path.split(/[\\/]/).pop()}
                                </span>
                              </div>
                              <div className="mt-2 break-all font-mono text-[11px] leading-5 text-muted-foreground">
                                {item.path}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                <span>{formatBytes(item.size)}</span>
                                <span>{formatDateTime(item.mtimeMs)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-14 text-center text-sm text-muted-foreground">
                    {TEXT.selectHint}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card className="border-border/70 bg-card/88 shadow-lg backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-base">{TEXT.taskStatus}</CardTitle>
                  <CardDescription>{TEXT.taskStatusDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        job.type === 'error'
                          ? 'destructive'
                          : job.type === 'completed'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {statusText(job.type)}
                    </Badge>
                    <div className="text-sm text-muted-foreground">{job.progress}%</div>
                  </div>
                  <Progress value={job.progress} />
                  <div className="rounded-2xl border border-border/70 px-4 py-3 text-sm leading-6">
                    {job.message}
                  </div>
                  {job.error ? (
                    <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {job.error}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      disabled={!job.running}
                      onClick={() => void cancelJob()}
                      type="button"
                      variant="outline"
                    >
                      <Square />
                      {TEXT.cancel}
                    </Button>
                    <Button
                      disabled={!job.outputDir}
                      onClick={() => job.outputDir && void window.wxapkg.openPath(job.outputDir)}
                      type="button"
                      variant="secondary"
                    >
                      <PackageOpen />
                      {TEXT.openOutput}
                    </Button>
                  </div>
                  <div className="grid gap-3 text-xs text-muted-foreground">
                    <div>
                      {TEXT.outputLocation}
                      {(job.outputDir ?? outputDir) || TEXT.notGenerated}
                    </div>
                    <div>
                      {TEXT.fileDone}
                      {job.fileCount ?? 0}
                    </div>
                    {scanError ? <div className="text-destructive">{scanError}</div> : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/88 shadow-lg backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-base">{TEXT.logs}</CardTitle>
                  <CardDescription>{TEXT.logsDesc}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[300px] rounded-2xl border border-border/70">
                    <div className="space-y-2 p-4">
                      {logs.length > 0 ? (
                        logs.map((log) => (
                          <div
                            className={`rounded-xl px-3 py-2 text-sm ${
                              log.tone === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : log.tone === 'success'
                                  ? 'bg-primary/10 text-foreground'
                                  : 'bg-muted/45 text-foreground'
                            }`}
                            key={log.id}
                          >
                            {log.text}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                          {TEXT.logEmpty}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
