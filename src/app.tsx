import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  FileCode2,
  FileJson2,
  Folder,
  FolderOpen,
  FolderOutput,
  HardDriveDownload,
  ImageIcon,
  Loader2,
  MoonStar,
  PackageOpen,
  Play,
  RefreshCcw,
  Search,
  Sparkles,
  Square,
  SunMedium,
  Terminal,
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
import { Switch } from './components/ui/switch';
import { useTheme } from './components/theme-provider';
import type { JobEvent, JobEventType, PackageEntry, ScanEntry } from './shared/types';

interface LogItem {
  createdAt: number;
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
  appCount: '个可解包项目',
  appDetail: '应用总览',
  appList: '项目列表',
  appPath: '缓存路径',
  beautify: '自动格式化',
  beautifyDesc: '默认美化 JSON、HTML、JS，二进制文件保持原样输出。',
  cancel: '取消任务',
  chooseFirst:
    '请先选择项目、输出目录，并确认 wxid 可用。',
  chooseOutput: '选择输出目录',
  console: '终端日志',
  consoleDesc: '保留最近 150 条记录，持续输出扫描与解包过程。',
  defaultDone: '默认目录扫描',
  defaultScanStart: '开始扫描默认目录',
  defaultSource: '默认扫描',
  discovered: '完成，共发现',
  emptyApps: '当前没有可展示的小程序记录',
  emptyScanning: '正在扫描目录，请稍候…',
  emptySelection: '左侧选择一个项目后，这里会显示缓存路径、包文件与解包控制项。',
  fileDone: '已输出文件数',
  importFail: '导入失败：',
  importInput: '导入目录或包',
  jobStatus: '任务状态',
  latestLogs: '实时输出',
  manualCancel: '已取消手动导入',
  manualDone: '手动导入',
  manualPickerOpen: '打开手动导入选择器',
  manualSource: '手动导入',
  manualWxid: '手动输入 wxid',
  manualWxidPlaceholder: '例如 wx1234567890abcdef',
  noAppFound: '完成，未发现可解包的小程序',
  noOutput: '尚未选择',
  openAppDir: '打开缓存目录',
  openOutput: '打开输出目录',
  outputDir: '输出目录',
  outputSet: '输出目录已设置为',
  packageCount: '包文件',
  packageExplorer: '包文件工作台',
  packageExplorerDesc: '展示当前选中项目的 wxapkg 包文件、大小与更新时间。',
  pendingWxid: '待输入 wxid',
  scanDefault: '扫描默认目录',
  scanFail: '扫描失败：',
  searchPlaceholder: '搜索 wxid / 路径 / 用户目录',
  startFail: '启动失败：',
  startUnpack: '开始解包',
  statusCompleted: '已完成',
  statusError: '失败',
  statusIdle: '待命',
  statusProcessing: '处理中',
  statusReady: '系统就绪',
  submitJob: '已提交解包任务：',
  subtitle: '把微信缓存里的 wxapkg 项目变成可浏览、可导出的工作台。',
  title: 'wxapkg Workbench',
  titleBadge: '专业桌面工作台',
  waiting: '等待开始解包',
};

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

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function statusText(type: JobViewState['type']): string {
  switch (type) {
    case 'started':
    case 'log':
    case 'progress':
      return TEXT.statusProcessing;
    case 'completed':
      return TEXT.statusCompleted;
    case 'cancelled':
      return TEXT.cancel;
    case 'error':
      return TEXT.statusError;
    default:
      return TEXT.statusIdle;
  }
}

function statusVariant(type: JobViewState['type']): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (type) {
    case 'completed':
      return 'default';
    case 'error':
      return 'destructive';
    case 'idle':
      return 'outline';
    default:
      return 'secondary';
  }
}

function sourceText(source: ScanEntry['source']): string {
  return source === 'default-scan' ? TEXT.defaultSource : TEXT.manualSource;
}

function packageKind(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  if (!extension) {
    return 'FILE';
  }

  return extension.toUpperCase();
}

function PackageIcon({ file }: { file: PackageEntry }): React.JSX.Element {
  const extension = file.path.split('.').pop()?.toLowerCase();

  if (extension === 'json') {
    return <FileJson2 className="size-4 text-amber-500" />;
  }

  if (extension === 'js') {
    return <FileCode2 className="size-4 text-emerald-500" />;
  }

  return <FileArchive className="size-4 text-sky-500" />;
}

function EntryIcon({
  entry,
  className,
}: {
  className?: string;
  entry: ScanEntry;
}): React.JSX.Element {
  if (entry.iconUrl) {
    return (
      <img
        alt={entry.wxid ?? 'wxapp icon'}
        className={className ?? 'size-14 rounded-2xl object-cover shadow-lg shadow-slate-300/40 dark:shadow-black/30'}
        src={entry.iconUrl}
      />
    );
  }

  return (
    <div
      className={className ?? 'flex size-14 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/60 text-muted-foreground'}
    >
      <ImageIcon className="size-6" />
    </div>
  );
}

function SidebarStatus({
  entriesCount,
  isScanning,
}: {
  entriesCount: number;
  isScanning: boolean;
}): React.JSX.Element {
  return (
    <div className="rounded-3xl border border-border/70 bg-white/80 p-4 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:bg-white/5 dark:shadow-none">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Library
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight">{entriesCount}</div>
          <div className="text-sm text-muted-foreground">{TEXT.appCount}</div>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          {isScanning ? <Loader2 className="size-5 animate-spin" /> : <HardDriveDownload className="size-5" />}
        </div>
      </div>
    </div>
  );
}

function AppHero({
  beautify,
  canStart,
  isScanning,
  job,
  manualWxid,
  onBeautifyChange,
  onChooseOutputDir,
  onImportInput,
  onManualWxidChange,
  onOpenAppDir,
  onOpenOutputDir,
  onScanDefaultRoot,
  onStartUnpack,
  outputDir,
  resolvedWxid,
  selectedEntry,
}: {
  beautify: boolean;
  canStart: boolean;
  isScanning: boolean;
  job: JobViewState;
  manualWxid: string;
  onBeautifyChange: (checked: boolean) => void;
  onChooseOutputDir: () => Promise<void>;
  onImportInput: () => Promise<void>;
  onManualWxidChange: (value: string) => void;
  onOpenAppDir: () => Promise<void>;
  onOpenOutputDir: () => Promise<void>;
  onScanDefaultRoot: () => Promise<void>;
  onStartUnpack: () => Promise<void>;
  outputDir: string;
  resolvedWxid: string;
  selectedEntry: ScanEntry | null;
}): React.JSX.Element {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-border/70 bg-white/80 p-5 shadow-2xl shadow-slate-200/45 backdrop-blur-2xl dark:border-white/10 dark:bg-white/5 dark:shadow-none"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <Badge className="rounded-full px-3 py-1 text-[10px] tracking-[0.22em]" variant="secondary">
              <Sparkles className="mr-1 size-3.5" />
              {TEXT.titleBadge}
            </Badge>
            <Badge className="rounded-full px-3 py-1" variant={statusVariant(job.type)}>
              {job.running ? TEXT.statusProcessing : TEXT.statusReady}
            </Badge>
          </div>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center">
            {selectedEntry ? (
              <EntryIcon
                className="size-18 rounded-[1.6rem] border border-white/30 object-cover shadow-2xl shadow-slate-300/40 dark:border-white/10 dark:shadow-black/20"
                entry={selectedEntry}
              />
            ) : (
              <div className="flex size-18 items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-muted/60">
                <Folder className="size-7 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                {selectedEntry?.wxid ?? TEXT.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {selectedEntry ? selectedEntry.appDir : TEXT.subtitle}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedEntry ? (
                  <>
                    <Badge variant="outline">{sourceText(selectedEntry.source)}</Badge>
                    <Badge variant="secondary">
                      {selectedEntry.wxapkgFiles.length} {TEXT.packageCount}
                    </Badge>
                    {selectedEntry.userId ? <Badge variant="outline">{selectedEntry.userId}</Badge> : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:w-[26rem]">
          <Button
            className="h-12 justify-center rounded-2xl border-slate-200 bg-white/80 font-semibold shadow-lg shadow-slate-200/40 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:shadow-none dark:hover:bg-white/10"
            onClick={() => void onScanDefaultRoot()}
            type="button"
            variant="outline"
          >
            {isScanning ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
            {TEXT.scanDefault}
          </Button>
          <Button
            className="h-12 justify-center rounded-2xl border-slate-200 bg-white/80 font-semibold shadow-lg shadow-slate-200/40 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:shadow-none dark:hover:bg-white/10"
            onClick={() => void onImportInput()}
            type="button"
            variant="outline"
          >
            <FolderOpen />
            {TEXT.importInput}
          </Button>
          <Button
            className="h-12 justify-center rounded-2xl border-slate-200 bg-white/80 font-semibold shadow-lg shadow-slate-200/40 hover:bg-white dark:border-white/10 dark:bg-white/6 dark:shadow-none dark:hover:bg-white/10"
            onClick={() => void onChooseOutputDir()}
            type="button"
            variant="outline"
          >
            <FolderOutput />
            {TEXT.chooseOutput}
          </Button>
          <Button
            className="h-12 justify-center rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 font-bold text-white shadow-xl shadow-blue-500/30 hover:brightness-110"
            disabled={!canStart}
            onClick={() => void onStartUnpack()}
            type="button"
          >
            {job.running ? <Loader2 className="animate-spin" /> : <Play />}
            {TEXT.startUnpack}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="rounded-[1.5rem] border border-border/70 bg-slate-50/80 p-4 dark:bg-white/[0.04]">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            {TEXT.outputDir}
          </div>
          <div className="mt-2 break-all font-mono text-xs leading-6">
            {outputDir || TEXT.noOutput}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="rounded-xl"
              disabled={!selectedEntry}
              onClick={() => void onOpenAppDir()}
              type="button"
              variant="ghost"
            >
              <FolderOpen />
              {TEXT.openAppDir}
            </Button>
            <Button
              className="rounded-xl"
              disabled={!job.outputDir && !outputDir}
              onClick={() => void onOpenOutputDir()}
              type="button"
              variant="ghost"
            >
              <PackageOpen />
              {TEXT.openOutput}
            </Button>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-border/70 bg-slate-50/80 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Decode
              </div>
              <div className="mt-1 text-sm font-semibold">{TEXT.beautify}</div>
            </div>
            <Switch checked={beautify} onCheckedChange={onBeautifyChange} />
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {TEXT.beautifyDesc}
          </div>
          {!selectedEntry?.wxid ? (
            <div className="mt-4 space-y-2">
              <div className="text-sm font-semibold">{TEXT.manualWxid}</div>
              <Input
                onChange={(event) => onManualWxidChange(event.target.value)}
                placeholder={TEXT.manualWxidPlaceholder}
                value={manualWxid}
              />
            </div>
          ) : null}
          <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm">
            <div className="text-muted-foreground">Resolved wxid</div>
            <div className="mt-1 font-mono text-xs">{resolvedWxid || TEXT.pendingWxid}</div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function PackageExplorer({
  selectedEntry,
}: {
  selectedEntry: ScanEntry | null;
}): React.JSX.Element {
  const packages = selectedEntry?.wxapkgFiles ?? [];

  return (
    <Card className="rounded-[2rem] border-border/70 bg-white/75 shadow-2xl shadow-slate-200/35 backdrop-blur-2xl dark:border-white/10 dark:bg-white/5 dark:shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-black tracking-tight">{TEXT.packageExplorer}</CardTitle>
        <CardDescription>{TEXT.packageExplorerDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        {selectedEntry ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
            <div className="grid grid-cols-[minmax(0,1.7fr)_120px_110px_118px] gap-3 border-b border-border/70 bg-slate-50/80 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground dark:bg-white/[0.04]">
              <div>Package</div>
              <div>Size</div>
              <div>Kind</div>
              <div>Updated</div>
            </div>
            <ScrollArea className="h-[30rem]">
              <div className="divide-y divide-border/60">
                <AnimatePresence initial={false}>
                  {packages.map((item, index) => (
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="grid grid-cols-[minmax(0,1.7fr)_120px_110px_118px] gap-3 px-4 py-4 text-sm transition-colors hover:bg-accent/50"
                      initial={{ opacity: 0, x: -8 }}
                      key={item.path}
                      transition={{ delay: Math.min(index * 0.02, 0.16) }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                          <PackageIcon file={item} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800 dark:text-slate-100">
                            {item.path.split(/[\\/]/).pop()}
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {item.path}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{formatBytes(item.size)}</div>
                      <div>
                        <Badge className="rounded-full" variant="outline">
                          {packageKind(item.path)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(item.mtimeMs)}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-border/70 px-6 py-16 text-center text-sm text-muted-foreground">
            {TEXT.emptySelection}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobPanel({
  job,
  onCancelJob,
  onOpenOutputDir,
}: {
  job: JobViewState;
  onCancelJob: () => Promise<void>;
  onOpenOutputDir: () => Promise<void>;
}): React.JSX.Element {
  return (
    <Card className="rounded-[2rem] border-border/70 bg-white/75 shadow-2xl shadow-slate-200/35 backdrop-blur-2xl dark:border-white/10 dark:bg-white/5 dark:shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-black tracking-tight">{TEXT.jobStatus}</CardTitle>
        <CardDescription>{job.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <Badge className="rounded-full px-3 py-1" variant={statusVariant(job.type)}>
            {statusText(job.type)}
          </Badge>
          <div className="text-sm font-bold text-primary">{job.progress}%</div>
        </div>
        <Progress className="h-3 rounded-full bg-slate-200/80 dark:bg-white/10" value={job.progress} />
        {job.error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {job.error}
          </div>
        ) : null}
        <div className="grid gap-3 text-sm">
          <div className="rounded-2xl border border-border/70 bg-slate-50/80 px-4 py-3 dark:bg-white/[0.04]">
            <div className="text-muted-foreground">{TEXT.fileDone}</div>
            <div className="mt-1 text-lg font-black">{job.fileCount ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-slate-50/80 px-4 py-3 dark:bg-white/[0.04]">
            <div className="text-muted-foreground">{TEXT.outputDir}</div>
            <div className="mt-1 break-all font-mono text-xs leading-6">{job.outputDir || TEXT.noOutput}</div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            className="rounded-2xl"
            disabled={!job.running}
            onClick={() => void onCancelJob()}
            type="button"
            variant="outline"
          >
            <Square />
            {TEXT.cancel}
          </Button>
          <Button
            className="rounded-2xl"
            disabled={!job.outputDir}
            onClick={() => void onOpenOutputDir()}
            type="button"
            variant="secondary"
          >
            <PackageOpen />
            {TEXT.openOutput}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LogConsole({
  job,
  logs,
}: {
  job: JobViewState;
  logs: LogItem[];
}): React.JSX.Element {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-slate-800/60 bg-[#0d1324] p-5 text-slate-100 shadow-2xl shadow-slate-300/20 dark:shadow-black/20"
      initial={{ opacity: 0, y: 18 }}
      transition={{ delay: 0.12, duration: 0.35 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-400/90" />
            <span className="size-2.5 rounded-full bg-amber-400/90" />
            <span className="size-2.5 rounded-full bg-emerald-400/90" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
            <Terminal className="size-3.5" />
            {TEXT.console}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
          <span className={`size-2 rounded-full ${job.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          {TEXT.latestLogs}
        </div>
      </div>
      <ScrollArea className="h-64 pr-2">
        <div className="space-y-3">
          {logs.length > 0 ? (
            logs.map((log, index) => {
              const icon =
                log.tone === 'error'
                  ? <AlertCircle className="mt-0.5 size-3.5 text-rose-400" />
                  : log.tone === 'success'
                    ? <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-400" />
                    : <Sparkles className="mt-0.5 size-3.5 text-sky-400" />;

              return (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 font-mono text-xs"
                  initial={{ opacity: 0, x: -6 }}
                  key={log.id}
                  transition={{ delay: Math.min(index * 0.02, 0.16) }}
                >
                  <span className="mt-0.5 text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                  {icon}
                  <div className="min-w-0 flex-1 leading-6">
                    <span className="mr-2 text-slate-500">[{formatClock(log.createdAt)}]</span>
                    <span className={log.tone === 'error' ? 'text-rose-100' : log.tone === 'success' ? 'text-emerald-100' : 'text-slate-200'}>
                      {log.text}
                    </span>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">{TEXT.consoleDesc}</div>
          )}
        </div>
      </ScrollArea>
    </motion.section>
  );
}

export function App(): React.JSX.Element {
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
  const { resolvedTheme } = useTheme();

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
    setLogs((current) => [
      ...current.slice(-149),
      { createdAt: Date.now(), id: crypto.randomUUID(), text, tone },
    ]);
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
        ? `${source}${TEXT.discovered} ${nextEntries.length} ${TEXT.appCount}`
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

  async function openOutputDir(): Promise<void> {
    const targetPath = job.outputDir ?? outputDir;
    if (!targetPath) {
      return;
    }

    await window.wxapkg.openPath(targetPath);
  }

  async function openAppDir(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    await window.wxapkg.openPath(selectedEntry.appDir);
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-[20rem] shrink-0 border-r border-border/70 bg-sidebar/85 px-4 py-5 backdrop-blur-2xl lg:flex lg:flex-col">
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center justify-between"
            initial={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 text-white shadow-xl shadow-blue-500/30">
                {resolvedTheme === 'dark' ? <MoonStar className="size-5" /> : <SunMedium className="size-5" />}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  WeChat Tooling
                </div>
                <div className="text-lg font-black tracking-tight">{TEXT.title}</div>
              </div>
            </div>
            <ThemeToggle />
          </motion.div>

          <div className="mt-6">
            <SidebarStatus entriesCount={entries.length} isScanning={isScanning} />
          </div>

          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-12 rounded-2xl border-border/70 bg-white/70 pl-11 shadow-lg shadow-slate-200/30 dark:bg-white/5 dark:shadow-none"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={TEXT.searchPlaceholder}
              value={keyword}
            />
          </div>

          <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            {TEXT.appList}
          </div>
          <ScrollArea className="mt-3 flex-1 pr-2">
            <div className="space-y-2">
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry, index) => {
                  const active = entry.id === selectedEntry?.id;
                  return (
                    <motion.button
                      animate={{ opacity: 1, y: 0 }}
                      className={`w-full rounded-[1.35rem] border p-3 text-left transition-all ${
                        active
                          ? 'border-primary/35 bg-white shadow-xl shadow-slate-200/35 dark:bg-white/8 dark:shadow-none'
                          : 'border-transparent bg-transparent hover:border-border/70 hover:bg-white/70 dark:hover:bg-white/5'
                      }`}
                      initial={{ opacity: 0, y: 8 }}
                      key={entry.id}
                      onClick={() => setSelectedId(entry.id)}
                      transition={{ delay: Math.min(index * 0.03, 0.18) }}
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <EntryIcon className="size-12 rounded-2xl object-cover" entry={entry} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold tracking-tight">
                            {entry.wxid ?? TEXT.pendingWxid}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {entry.wxapkgFiles.length} {TEXT.packageCount}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge className="rounded-full px-2 py-0.5 text-[10px]" variant={entry.source === 'default-scan' ? 'secondary' : 'outline'}>
                              {sourceText(entry.source)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                  {isScanning ? TEXT.emptyScanning : TEXT.emptyApps}
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-6 px-4 py-4 lg:px-6 lg:py-6">
            <AppHero
              beautify={beautify}
              canStart={canStart}
              isScanning={isScanning}
              job={job}
              manualWxid={manualWxid}
              onBeautifyChange={setBeautify}
              onChooseOutputDir={chooseOutputDir}
              onImportInput={importInput}
              onManualWxidChange={setManualWxid}
              onOpenAppDir={openAppDir}
              onOpenOutputDir={openOutputDir}
              onScanDefaultRoot={scanDefaultRoot}
              onStartUnpack={startUnpack}
              outputDir={outputDir}
              resolvedWxid={resolvedWxid}
              selectedEntry={selectedEntry}
            />

            <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
              <PackageExplorer selectedEntry={selectedEntry} />
              <div className="space-y-6">
                <JobPanel
                  job={job}
                  onCancelJob={cancelJob}
                  onOpenOutputDir={openOutputDir}
                />
                {scanError ? (
                  <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                    {scanError}
                  </div>
                ) : null}
              </div>
            </div>

            <LogConsole job={job} logs={logs} />
          </div>
        </main>
      </div>
    </div>
  );
}
