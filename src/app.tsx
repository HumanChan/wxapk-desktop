import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileArchive,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
  FolderOutput,
  HardDriveDownload,
  ImageIcon,
  Loader2,
  Menu,
  PackageOpen,
  Play,
  Search,
  Sparkles,
  Square,
  Terminal,
  X,
} from 'lucide-react';

import { ThemeToggle } from './components/theme-toggle';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Progress } from './components/ui/progress';
import { ScrollArea } from './components/ui/scroll-area';
import { Switch } from './components/ui/switch';
import type {
  JobEvent,
  JobEventType,
  OutputTreeNode,
  PackageEntry,
  ScanEntry,
} from './shared/types';

interface LogItem {
  createdAt: number;
  id: string;
  text: string;
  tone: 'default' | 'error' | 'success';
}

type BadgeTone = 'default' | 'destructive' | 'secondary' | 'outline';
type PreviewTab = 'packages' | 'logs' | 'output';
type TreeStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface ActionItem {
  disabled?: boolean;
  label: string;
  onSelect: () => void | Promise<void>;
}

interface JobViewState {
  entryId: string | null;
  error: string | null;
  fileCount: number | null;
  id: string | null;
  message: string;
  outputDir: string | null;
  progress: number;
  running: boolean;
  type: JobEventType | 'idle';
  wxid: string | null;
}

interface TreeRow {
  depth: number;
  node: OutputTreeNode;
}

const TEXT = {
  appCount: '个包文件',
  appName: 'WxApkTool',
  cachePath: '应用目录',
  chooseFirst: '请先选择项目、输出目录，并确认 wxid 可用。',
  chooseOutputDir: '输出目录',
  cancelJob: '取消任务',
  copyFailed: '复制失败：',
  copyOutput: '复制输出路径',
  copyPath: '复制缓存路径',
  copyWxid: '复制 wxid',
  defaultRoot: '默认缓存目录',
  defaultScanDone: '默认目录扫描',
  defaultScanStart: '开始扫描默认目录',
  emptyApps: '当前没有可展示的小程序记录',
  emptyLogs: '日志会在这里持续输出扫描、解包和文件树加载过程。',
  emptyOutput: '尚未选择',
  emptyPackages: '当前项目没有可展示的包文件。',
  emptySelection: '左侧选择一个项目后，右侧会展示应用信息、日志和文件树。',
  emptyTree: '当前还没有可展示的输出文件树。开始解包后会自动切换到结果预览。',
  fileDone: '已输出文件数',
  finderCurrent: '打开当前目录',
  finderOutput: '打开输出目录',
  importCancel: '已取消手动导入',
  importDone: '手动导入',
  importInput: '导入包目录或包',
  importOpen: '打开手动导入选择器',
  inputDir: '输入目录',
  inputDirDone: '自定义目录扫描',
  inputDirOpen: '选择扫描根目录',
  inputTypeDir: '目录项目',
  inputTypeFile: '单文件包',
  listPlaceholder: '搜索 wxid / 路径 / 包文件',
  loadTreeFailed: '读取输出目录失败：',
  loadTreeStart: '正在读取输出目录树：',
  loadTreeSuccess: '输出目录树已加载：',
  logTab: '日志区',
  logsLive: '实时日志',
  logsTabDesc: '显示扫描、解包、错误和完成事件。',
  manualSource: '手动导入',
  manualWxid: '手动输入 wxid',
  manualWxidDetected: '手动输入',
  manualWxidPlaceholder: '例如 wx1234567890abcdef',
  noAppFound: '完成，未发现可解包的小程序',
  openAppDir: '打开缓存目录',
  outputGenerated: '已生成',
  outputPath: '输出路径',
  outputPending: '未设置',
  outputReady: '已设置',
  outputTab: '输出文件树预览',
  outputTabDesc: '展示真实解包后的目录结构。',
  packageTab: '包体文件树预览',
  packageTabDesc: '根据 wxapkg 包路径构建的虚拟树，用来核对输入结构。',
  pendingWxid: '待输入 wxid',
  pickOutputDone: '输出目录已设置为',
  previewActions: '操作',
  refreshTree: '刷新文件树',
  scanFail: '扫描失败：',
  selectedNode: '当前节点',
  sourceDefault: '默认扫描',
  startFail: '启动失败：',
  startUnpack: '开始解包',
  statusCancelled: '已取消',
  statusCompleted: '已完成',
  statusError: '失败',
  statusIdle: '待命',
  statusProcessing: '处理中',
  subtitle: '把微信缓存里的 wxapkg 项目变成可浏览、可导出的桌面工作台。',
  submitJob: '已提交解包任务：',
  tabOutputEmpty: '输出目录为空',
  treeStateEmpty: '为空',
  treeStateError: '读取失败',
  treeStateIdle: '未解包',
  treeStateLoading: '正在加载',
  treeStateReady: '已加载',
  waitStart: '等待开始解包',
  wxidCopied: '已复制',
  scanning: '正在扫描目录，请稍候…',
};

const EMPTY_JOB: JobViewState = {
  entryId: null,
  error: null,
  fileCount: null,
  id: null,
  message: TEXT.waitStart,
  outputDir: null,
  progress: 0,
  running: false,
  type: 'idle',
  wxid: null,
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

function sourceText(source: ScanEntry['source']): string {
  return source === 'default-scan' ? TEXT.sourceDefault : TEXT.manualSource;
}

function inputKindText(inputKind: ScanEntry['inputKind']): string {
  return inputKind === 'appDir' ? TEXT.inputTypeDir : TEXT.inputTypeFile;
}

function jobStatusText(type: JobViewState['type']): string {
  switch (type) {
    case 'started':
    case 'log':
    case 'progress':
      return TEXT.statusProcessing;
    case 'completed':
      return TEXT.statusCompleted;
    case 'cancelled':
      return TEXT.statusCancelled;
    case 'error':
      return TEXT.statusError;
    default:
      return TEXT.statusIdle;
  }
}

function jobStatusVariant(type: JobViewState['type']): BadgeTone {
  switch (type) {
    case 'completed':
      return 'default';
    case 'error':
      return 'destructive';
    case 'cancelled':
      return 'outline';
    case 'idle':
      return 'outline';
    default:
      return 'secondary';
  }
}

function treeStatusText(status: TreeStatus): string {
  switch (status) {
    case 'loading':
      return TEXT.treeStateLoading;
    case 'ready':
      return TEXT.treeStateReady;
    case 'empty':
      return TEXT.treeStateEmpty;
    case 'error':
      return TEXT.treeStateError;
    default:
      return TEXT.treeStateIdle;
  }
}

function treeStatusVariant(status: TreeStatus): BadgeTone {
  switch (status) {
    case 'ready':
      return 'default';
    case 'loading':
      return 'secondary';
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

function treeNodeKind(node: OutputTreeNode): string {
  if (node.kind === 'directory') {
    return 'DIR';
  }

  return node.extension ? node.extension.replace('.', '').toUpperCase() : 'FILE';
}

function fileIconByExtension(extension?: string | null): React.JSX.Element {
  const normalized = extension?.replace('.', '').toLowerCase();

  if (normalized === 'json') {
    return <FileJson2 className="size-4 text-amber-500" />;
  }

  if (['js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less'].includes(normalized ?? '')) {
    return <FileCode2 className="size-4 text-emerald-500" />;
  }

  if (['html', 'wxml', 'xml', 'md', 'txt'].includes(normalized ?? '')) {
    return <FileText className="size-4 text-violet-500" />;
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(normalized ?? '')) {
    return <ImageIcon className="size-4 text-sky-500" />;
  }

  return <FileArchive className="size-4 text-slate-500" />;
}

function TreeNodeIcon({
  isExpanded,
  node,
}: {
  isExpanded: boolean;
  node: OutputTreeNode;
}): React.JSX.Element {
  if (node.kind === 'directory') {
    return isExpanded
      ? <FolderOpen className="size-4 text-sky-500" />
      : <Folder className="size-4 text-sky-500" />;
  }

  return fileIconByExtension(node.extension);
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
        className={className ?? 'size-12 rounded-2xl object-cover shadow-lg shadow-slate-300/40 dark:shadow-black/30'}
        src={entry.iconUrl}
      />
    );
  }

  return (
    <div className={className ?? 'flex size-12 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-white/70 text-muted-foreground dark:bg-white/10'}>
      <ImageIcon className="size-5" />
    </div>
  );
}

function createDirectoryNode(name: string, relativePath: string, absolutePath: string): OutputTreeNode {
  return {
    absolutePath,
    children: [],
    extension: null,
    id: relativePath,
    kind: 'directory',
    mtimeMs: 0,
    name,
    relativePath,
    size: 0,
  };
}

function sortTreeNodes(nodes: OutputTreeNode[]): OutputTreeNode[] {
  return nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function finalizeTree(node: OutputTreeNode): OutputTreeNode {
  if (node.kind !== 'directory') {
    return node;
  }

  const children = sortTreeNodes((node.children ?? []).map(finalizeTree));
  const fileCount = children.reduce((count, child) => count + (child.kind === 'file' ? 1 : 0), 0);
  const nestedSize = children.reduce((total, child) => total + child.size, 0);
  const maxMtime = children.reduce((current, child) => Math.max(current, child.mtimeMs), node.mtimeMs);

  return {
    ...node,
    children,
    mtimeMs: maxMtime,
    size: nestedSize || fileCount,
  };
}

function buildPackageTree(files: PackageEntry[]): { fileCount: number; root: OutputTreeNode } {
  const root = createDirectoryNode('包体根目录', '.', '.');

  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    let current = root;
    let relativePath = '';

    for (const [index, segment] of segments.entries()) {
      relativePath = relativePath ? `${relativePath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        current.children?.push({
          absolutePath: normalizedPath,
          extension: normalizedPath.includes('.') ? `.${normalizedPath.split('.').pop()?.toLowerCase()}` : null,
          id: relativePath,
          kind: 'file',
          mtimeMs: file.mtimeMs,
          name: segment,
          relativePath,
          size: file.size,
        });
        continue;
      }

      let next = current.children?.find(
        (child) => child.kind === 'directory' && child.name === segment,
      );

      if (!next) {
        next = createDirectoryNode(segment, relativePath, relativePath);
        current.children?.push(next);
      }

      current = next;
    }
  }

  return {
    fileCount: files.length,
    root: finalizeTree(root),
  };
}

function findTreeNode(root: OutputTreeNode | null, absolutePath: string | null): OutputTreeNode | null {
  if (!root || !absolutePath) {
    return null;
  }

  if (root.absolutePath === absolutePath) {
    return root;
  }

  for (const child of root.children ?? []) {
    const match = findTreeNode(child, absolutePath);
    if (match) {
      return match;
    }
  }

  return null;
}

function collectVisibleTreeRows(root: OutputTreeNode, expandedPaths: Set<string>): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (node: OutputTreeNode, depth: number): void => {
    rows.push({ depth, node });
    if (node.kind !== 'directory' || !expandedPaths.has(node.absolutePath)) {
      return;
    }

    for (const child of node.children ?? []) {
      walk(child, depth + 1);
    }
  };

  walk(root, 0);
  return rows;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function ActionMenu({ actions }: { actions: ActionItem[] }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        className="rounded-full border-slate-300/70 bg-white/90 px-4 dark:border-white/10 dark:bg-white/10"
        onClick={() => setOpen((current) => !current)}
        type="button"
        variant="outline"
      >
        <Ellipsis />
        {TEXT.previewActions}
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 z-30 mt-2 w-64 rounded-[1.35rem] border border-border/70 bg-white/95 p-2 shadow-2xl shadow-slate-200/45 backdrop-blur-xl dark:border-white/10 dark:bg-[#11162b]/95 dark:shadow-black/40"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            {actions.map((action) => (
              <button
                className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={action.disabled}
                key={action.label}
                onClick={() => {
                  void action.onSelect();
                  setOpen(false);
                }}
                type="button"
              >
                <span>{action.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TopToolbar({
  isScanning,
  onChooseOutputDir,
  onImportInput,
  onPickScanRoot,
  onToggleList,
}: {
  isScanning: boolean;
  onChooseOutputDir: () => Promise<void>;
  onImportInput: () => Promise<void>;
  onPickScanRoot: () => Promise<void>;
  onToggleList: () => void;
}): React.JSX.Element {
  return (
    <div className="rounded-[1.9rem] border border-slate-200/80 bg-sky-50/90 px-4 py-3 shadow-lg shadow-slate-200/35 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            className="rounded-full xl:hidden"
            onClick={onToggleList}
            size="icon"
            type="button"
            variant="outline"
          >
            <Menu />
          </Button>
          <div className="truncate text-lg font-black tracking-tight text-slate-900 dark:text-white">
            {TEXT.appName}
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-center gap-2 max-xl:w-full max-xl:justify-start">
          <Button
            className="h-11 rounded-full border-violet-200 bg-white/95 px-5 font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-violet-500/30 dark:bg-white/10 dark:text-slate-100"
            onClick={() => void onImportInput()}
            type="button"
            variant="outline"
          >
            <FolderOpen className="text-violet-600 dark:text-violet-300" />
            {TEXT.importInput}
          </Button>
          <Button
            className="h-11 rounded-full border-violet-200 bg-white/95 px-5 font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-violet-500/30 dark:bg-white/10 dark:text-slate-100"
            onClick={() => void onPickScanRoot()}
            type="button"
            variant="outline"
          >
            {isScanning ? <Loader2 className="animate-spin text-violet-600 dark:text-violet-300" /> : <HardDriveDownload className="text-violet-600 dark:text-violet-300" />}
            {TEXT.inputDir}
          </Button>
          <Button
            className="h-11 rounded-full border-violet-200 bg-white/95 px-5 font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-violet-500/30 dark:bg-white/10 dark:text-slate-100"
            onClick={() => void onChooseOutputDir()}
            type="button"
            variant="outline"
          >
            <FolderOutput className="text-violet-600 dark:text-violet-300" />
            {TEXT.chooseOutputDir}
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function ListPanel({
  entries,
  filteredEntries,
  isScanning,
  keyword,
  onKeywordChange,
  onSelectEntry,
  selectedEntry,
}: {
  entries: ScanEntry[];
  filteredEntries: ScanEntry[];
  isScanning: boolean;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSelectEntry: (entryId: string) => void;
  selectedEntry: ScanEntry | null;
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[32rem] flex-col rounded-[1.9rem] border border-lime-200/70 bg-lime-100/70 p-3 shadow-lg shadow-lime-100/40 dark:border-lime-500/20 dark:bg-lime-950/20 dark:shadow-none">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          className="h-11 rounded-full border-white/80 bg-white/95 pl-10 shadow-sm dark:border-white/10 dark:bg-white/10"
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder={TEXT.listPlaceholder}
          value={keyword}
        />
      </div>

      <div className="mt-4 flex-1 overflow-hidden rounded-[1.5rem] bg-white/45 p-2 dark:bg-black/10">
        <ScrollArea className="h-full pr-1">
          <div className="space-y-2">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => {
                const active = entry.id === selectedEntry?.id;
                return (
                  <button
                    className={`w-full rounded-[1.35rem] border px-3 py-3 text-left transition-all ${
                      active
                        ? 'border-emerald-300 bg-white shadow-sm dark:border-emerald-400/40 dark:bg-white/10'
                        : 'border-transparent bg-white/55 hover:border-white/90 hover:bg-white/85 dark:bg-white/5 dark:hover:border-white/15 dark:hover:bg-white/10'
                    }`}
                    key={entry.id}
                    onClick={() => onSelectEntry(entry.id)}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <EntryIcon entry={entry} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                          {entry.wxid ?? TEXT.pendingWxid}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {entry.wxapkgFiles.length} {TEXT.appCount}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge className="rounded-full px-2 py-0.5 text-[10px]" variant={entry.source === 'default-scan' ? 'secondary' : 'outline'}>
                            {sourceText(entry.source)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[1.35rem] border border-dashed border-slate-300/80 px-4 py-10 text-center text-sm text-muted-foreground dark:border-white/15">
                {isScanning ? TEXT.scanning : entries.length === 0 ? TEXT.emptySelection : TEXT.emptyApps}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function InfoStrip({
  beautify,
  canStart,
  job,
  manualWxid,
  onBeautifyChange,
  onManualWxidChange,
  onStartUnpack,
  outputDir,
  resolvedWxid,
  scanRootLabel,
  selectedEntry,
  selectedNode,
  treeStatus,
}: {
  beautify: boolean;
  canStart: boolean;
  job: JobViewState;
  manualWxid: string;
  onBeautifyChange: (checked: boolean) => void;
  onManualWxidChange: (value: string) => void;
  onStartUnpack: () => Promise<void>;
  outputDir: string;
  resolvedWxid: string;
  scanRootLabel: string;
  selectedEntry: ScanEntry | null;
  selectedNode: OutputTreeNode | null;
  treeStatus: TreeStatus;
}): React.JSX.Element {
  return (
    <div className="rounded-[1.9rem] border border-cyan-200/70 bg-cyan-100/80 p-4 shadow-lg shadow-cyan-100/40 dark:border-cyan-400/20 dark:bg-cyan-950/20 dark:shadow-none">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {selectedEntry ? (
              <EntryIcon className="size-12 rounded-2xl object-cover ring-2 ring-white/70 dark:ring-white/10" entry={selectedEntry} />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 text-muted-foreground dark:border-white/15 dark:bg-white/10">
                <Sparkles className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-black tracking-tight text-slate-900 dark:text-white">
                {selectedEntry?.wxid ?? TEXT.appName}
              </div>
              <div className="truncate text-sm text-slate-600 dark:text-slate-300">
                {selectedEntry?.appDir ?? TEXT.subtitle}
              </div>
              {selectedEntry ? (
                <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {TEXT.inputDir}: {scanRootLabel}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedEntry ? (
                  <>
                    <Badge className="rounded-full px-3 py-1" variant="outline">{sourceText(selectedEntry.source)}</Badge>
                    <Badge className="rounded-full px-3 py-1" variant="outline">{inputKindText(selectedEntry.inputKind)}</Badge>
                    <Badge className="rounded-full px-3 py-1" variant={jobStatusVariant(job.type)}>{jobStatusText(job.type)}</Badge>
                    <Badge className="rounded-full px-3 py-1" variant={treeStatusVariant(treeStatus)}>{treeStatusText(treeStatus)}</Badge>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          {!selectedEntry?.wxid && selectedEntry ? (
            <div className="mt-3 max-w-sm">
              <Input
                className="h-10 rounded-full border-white/80 bg-white/95 dark:border-white/10 dark:bg-white/10"
                onChange={(event) => onManualWxidChange(event.target.value)}
                placeholder={TEXT.manualWxidPlaceholder}
                value={manualWxid}
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-[16rem] flex-col gap-3 xl:w-[18rem]">
          <div className="rounded-[1.4rem] border border-white/80 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">自动格式化</div>
                <div className="text-[11px] text-muted-foreground">JSON / HTML / JS 会自动美化</div>
              </div>
              <Switch checked={beautify} onCheckedChange={onBeautifyChange} />
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-white/80 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>{TEXT.outputPath}</span>
              <Badge className="rounded-full px-2 py-0.5" variant={outputDir ? 'secondary' : 'outline'}>
                {outputDir ? TEXT.outputReady : TEXT.outputPending}
              </Badge>
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {outputDir || TEXT.emptyOutput}
            </div>
            {selectedNode ? (
              <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                {TEXT.selectedNode}: {selectedNode.relativePath}
              </div>
            ) : null}
            {!selectedEntry?.wxid && selectedEntry ? (
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                wxid: {resolvedWxid || TEXT.pendingWxid}
              </div>
            ) : null}
          </div>
        </div>

        <div className="w-full min-w-[15rem] xl:w-[18rem]">
          <div className="rounded-[1.5rem] border border-white/80 bg-white/90 p-4 dark:border-white/10 dark:bg-white/10">
            <div className="flex items-center justify-between gap-3">
              <Badge className="rounded-full px-3 py-1" variant={jobStatusVariant(job.type)}>
                {jobStatusText(job.type)}
              </Badge>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-100">{job.progress}%</div>
            </div>
            <Progress className="mt-3 h-2.5 rounded-full bg-slate-200/80 dark:bg-white/10" value={job.progress} />
            <div className="mt-3 text-[11px] leading-5 text-muted-foreground">
              {job.message}
            </div>
            <Button
              className="mt-4 h-12 w-full rounded-2xl bg-slate-900 font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              disabled={!canStart}
              onClick={() => void onStartUnpack()}
              type="button"
            >
              {job.running ? <Loader2 className="animate-spin" /> : <Play />}
              {TEXT.startUnpack}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeTable({
  emptyText,
  onOpenDirectory,
  onSelect,
  onToggle,
  root,
  selectedPath,
  visibleRows,
}: {
  emptyText: string;
  onOpenDirectory?: (path: string) => Promise<void>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  root: OutputTreeNode | null;
  selectedPath: string | null;
  visibleRows: TreeRow[];
}): React.JSX.Element {
  if (!root) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300/80 bg-white/45 px-6 text-center text-sm text-muted-foreground dark:border-white/15 dark:bg-white/5">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white/65 dark:border-white/10 dark:bg-slate-950/35">
      <div className="grid grid-cols-[minmax(0,1.8fr)_110px_110px_120px] gap-3 border-b border-slate-200/80 bg-white/70 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <div>名称</div>
        <div>大小</div>
        <div>类型</div>
        <div>更新时间</div>
      </div>
      <ScrollArea className="h-[30rem]">
        <div className="divide-y divide-slate-200/70 dark:divide-white/8">
          {visibleRows.map(({ depth, node }) => {
            const isSelected = node.absolutePath === selectedPath;
            const isExpanded = node.kind === 'directory' && visibleRows.some(
              (row) => row.depth === depth + 1 && row.node.absolutePath !== node.absolutePath && row.node.relativePath.startsWith(node.relativePath === '.' ? '' : `${node.relativePath}/`),
            );

            return (
              <button
                className={`grid w-full grid-cols-[minmax(0,1.8fr)_110px_110px_120px] gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  isSelected ? 'bg-emerald-100/70 dark:bg-emerald-500/10' : 'hover:bg-white/80 dark:hover:bg-white/5'
                }`}
                key={node.id}
                onClick={() => {
                  onSelect(node.absolutePath);
                  if (node.kind === 'directory') {
                    onToggle(node.absolutePath);
                  }
                }}
                onDoubleClick={() => {
                  if (node.kind === 'directory' && onOpenDirectory) {
                    void onOpenDirectory(node.absolutePath);
                  }
                }}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-3" style={{ paddingLeft: `${depth * 1.1}rem` }}>
                  {node.kind === 'directory' ? (
                    isExpanded ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />
                  ) : (
                    <span className="size-4" />
                  )}
                  <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-100">
                    <TreeNodeIcon isExpanded={isExpanded} node={node} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{node.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{node.relativePath}</div>
                  </div>
                </div>
                <div className="font-mono text-xs text-muted-foreground">{node.kind === 'directory' ? '—' : formatBytes(node.size)}</div>
                <div>
                  <Badge className="rounded-full" variant="outline">{treeNodeKind(node)}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{node.mtimeMs > 0 ? formatDateTime(node.mtimeMs) : '—'}</div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function LogsPanel({ logs }: { logs: LogItem[] }): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-800/60 bg-[#0d1324] p-4 text-slate-100">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-400/90" />
            <span className="size-2.5 rounded-full bg-amber-400/90" />
            <span className="size-2.5 rounded-full bg-emerald-400/90" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
            <Terminal className="size-3.5" />
            {TEXT.logsLive}
          </div>
        </div>
      </div>
      <ScrollArea className="h-[30rem] pr-2">
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
                <div className="flex items-start gap-3 font-mono text-xs" key={log.id}>
                  <span className="mt-0.5 text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                  {icon}
                  <div className="min-w-0 flex-1 leading-6">
                    <span className="mr-2 text-slate-500">[{formatClock(log.createdAt)}]</span>
                    <span className={log.tone === 'error' ? 'text-rose-100' : log.tone === 'success' ? 'text-emerald-100' : 'text-slate-200'}>
                      {log.text}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center text-sm text-slate-400">{TEXT.emptyLogs}</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PreviewTabs({
  activeTab,
  actions,
  logs,
  onChange,
  onOpenOutputDir,
  outputRoot,
  outputRows,
  outputSelectedPath,
  outputStatus,
  packageRoot,
  packageRows,
  packageSelectedPath,
  selectedEntry,
  treeError,
  treeFileCount,
  onOpenOutputDirectory,
  onSelectOutputNode,
  onSelectPackageNode,
  onToggleOutputNode,
  onTogglePackageNode,
}: {
  activeTab: PreviewTab;
  actions: ActionItem[];
  logs: LogItem[];
  onChange: (tab: PreviewTab) => void;
  onOpenOutputDir: (path: string) => Promise<void>;
  onOpenOutputDirectory: () => Promise<void>;
  onSelectOutputNode: (path: string) => void;
  onSelectPackageNode: (path: string) => void;
  onToggleOutputNode: (path: string) => void;
  onTogglePackageNode: (path: string) => void;
  outputRoot: OutputTreeNode | null;
  outputRows: TreeRow[];
  outputSelectedPath: string | null;
  outputStatus: TreeStatus;
  packageRoot: OutputTreeNode | null;
  packageRows: TreeRow[];
  packageSelectedPath: string | null;
  selectedEntry: ScanEntry | null;
  treeError: string | null;
  treeFileCount: number;
}): React.JSX.Element {
  const tabs: Array<{ description: string; id: PreviewTab; label: string }> = [
    { description: TEXT.packageTabDesc, id: 'packages', label: TEXT.packageTab },
    { description: TEXT.logsTabDesc, id: 'logs', label: TEXT.logTab },
    { description: TEXT.outputTabDesc, id: 'output', label: TEXT.outputTab },
  ];

  return (
    <div className="flex min-h-[34rem] flex-col rounded-[1.9rem] border border-yellow-200/70 bg-yellow-50/85 p-4 shadow-lg shadow-yellow-100/45 dark:border-yellow-400/15 dark:bg-yellow-950/12 dark:shadow-none">
      <div className="flex flex-col gap-3 border-b border-yellow-200/70 pb-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-white dark:text-slate-900'
                  : 'bg-white/55 text-slate-600 hover:bg-white/85 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12'
              }`}
              key={tab.id}
              onClick={() => onChange(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'output' ? (
            <Badge className="rounded-full px-3 py-1" variant={treeStatusVariant(outputStatus)}>
              {treeStatusText(outputStatus)}
            </Badge>
          ) : null}
          <ActionMenu actions={actions} />
        </div>
      </div>

      <div className="mt-4 flex-1">
        {activeTab === 'packages' ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">{TEXT.packageTabDesc}</div>
            <TreeTable
              emptyText={selectedEntry ? TEXT.emptyPackages : TEXT.emptySelection}
              onSelect={onSelectPackageNode}
              onToggle={onTogglePackageNode}
              root={packageRoot}
              selectedPath={packageSelectedPath}
              visibleRows={packageRows}
            />
          </div>
        ) : null}

        {activeTab === 'logs' ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">{TEXT.logsTabDesc}</div>
            <LogsPanel logs={logs} />
          </div>
        ) : null}

        {activeTab === 'output' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span>{TEXT.outputTabDesc}</span>
              <div className="flex items-center gap-2">
                <Badge className="rounded-full px-3 py-1" variant={outputStatus === 'ready' ? 'secondary' : 'outline'}>
                  {treeFileCount > 0 ? `${treeFileCount} files` : treeStatusText(outputStatus)}
                </Badge>
                <Button
                  className="rounded-full"
                  disabled={!outputRoot}
                  onClick={() => void onOpenOutputDirectory()}
                  type="button"
                  variant="outline"
                >
                  <PackageOpen />
                  {TEXT.finderOutput}
                </Button>
              </div>
            </div>
            {outputStatus === 'loading' ? (
              <div className="flex min-h-[24rem] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300/80 bg-white/45 text-sm text-muted-foreground dark:border-white/15 dark:bg-white/5">
                <Loader2 className="mr-2 size-5 animate-spin text-primary" />
                {TEXT.loadTreeStart}
              </div>
            ) : outputStatus === 'error' ? (
              <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
                <div className="font-semibold">{TEXT.treeStateError}</div>
                <div className="mt-2 break-all leading-6">{treeError}</div>
              </div>
            ) : outputStatus === 'empty' ? (
              <div className="flex min-h-[24rem] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300/80 bg-white/45 px-6 text-center text-sm text-muted-foreground dark:border-white/15 dark:bg-white/5">
                {TEXT.tabOutputEmpty}
              </div>
            ) : (
              <TreeTable
                emptyText={TEXT.emptyTree}
                onOpenDirectory={onOpenOutputDir}
                onSelect={onSelectOutputNode}
                onToggle={onToggleOutputNode}
                root={outputRoot}
                selectedPath={outputSelectedPath}
                visibleRows={outputRows}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function App(): React.JSX.Element {
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [scanRootLabel, setScanRootLabel] = useState(TEXT.defaultRoot);
  const [beautify, setBeautify] = useState(true);
  const [manualWxid, setManualWxid] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [job, setJob] = useState<JobViewState>(EMPTY_JOB);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [activeTab, setActiveTab] = useState<PreviewTab>('packages');
  const [expandedPackagePaths, setExpandedPackagePaths] = useState<string[]>(['.']);
  const [selectedPackagePath, setSelectedPackagePath] = useState<string | null>('.');
  const [outputTreeEntryId, setOutputTreeEntryId] = useState<string | null>(null);
  const [outputTreeRoot, setOutputTreeRoot] = useState<OutputTreeNode | null>(null);
  const [outputTreeStatus, setOutputTreeStatus] = useState<TreeStatus>('idle');
  const [outputTreeError, setOutputTreeError] = useState<string | null>(null);
  const [outputTreeFileCount, setOutputTreeFileCount] = useState(0);
  const [outputTreeRootDir, setOutputTreeRootDir] = useState<string | null>(null);
  const [expandedOutputPaths, setExpandedOutputPaths] = useState<string[]>([]);
  const [selectedOutputPath, setSelectedOutputPath] = useState<string | null>(null);
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
  const activeJobMetaRef = useRef<{ entryId: string; outputDir: string; wxid: string } | null>(null);
  const outputTreeLoadVersionRef = useRef(0);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  const filteredEntries = useMemo(
    () => entries.filter((entry) => {
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
    }),
    [deferredKeyword, entries],
  );

  const packageTree = useMemo(
    () => buildPackageTree(selectedEntry?.wxapkgFiles ?? []),
    [selectedEntry],
  );
  const packageExpandedSet = useMemo(() => new Set(expandedPackagePaths), [expandedPackagePaths]);
  const packageRows = useMemo(
    () => collectVisibleTreeRows(packageTree.root, packageExpandedSet),
    [packageExpandedSet, packageTree.root],
  );
  const outputExpandedSet = useMemo(() => new Set(expandedOutputPaths), [expandedOutputPaths]);
  const outputRows = useMemo(
    () => (outputTreeRoot ? collectVisibleTreeRows(outputTreeRoot, outputExpandedSet) : []),
    [outputExpandedSet, outputTreeRoot],
  );
  const selectedPackageNode = selectedEntry
    ? (findTreeNode(packageTree.root, selectedPackagePath) ?? packageTree.root)
    : null;
  const hasOutputTree = Boolean(
    selectedEntry && outputTreeEntryId === selectedEntry.id && outputTreeStatus !== 'idle',
  );
  const selectedOutputNode = hasOutputTree
    ? findTreeNode(outputTreeRoot, selectedOutputPath) ?? outputTreeRoot
    : null;
  const resolvedWxid = selectedEntry?.wxid ?? manualWxid.trim();
  const canStart = Boolean(selectedEntry && outputDir.trim() && resolvedWxid && !job.running);
  const selectedPreviewNode = activeTab === 'output' ? selectedOutputNode : selectedPackageNode;

  function pushLog(text: string, tone: LogItem['tone'] = 'default'): void {
    setLogs((current) => [
      ...current.slice(-149),
      { createdAt: Date.now(), id: crypto.randomUUID(), text, tone },
    ]);
  }

  function resetOutputTree(): void {
    setOutputTreeRoot(null);
    setOutputTreeStatus('idle');
    setOutputTreeError(null);
    setOutputTreeFileCount(0);
    setOutputTreeRootDir(null);
    setExpandedOutputPaths([]);
    setSelectedOutputPath(null);
  }

  function applyEntries(nextEntries: ScanEntry[], source: string): void {
    startTransition(() => {
      setEntries(nextEntries);
      setSelectedId((current) => (
        nextEntries.some((entry) => entry.id === current)
          ? current
          : (nextEntries[0]?.id ?? null)
      ));
    });

    setScanError(null);
    setActiveTab('packages');
    pushLog(
      nextEntries.length > 0
        ? `${source}完成，共发现 ${nextEntries.length} 个可解包项目`
        : `${source}${TEXT.noAppFound}`,
      'success',
    );
  }

  async function openPathWithFeedback(targetPath: string, failurePrefix: string): Promise<void> {
    const result = await window.wxapkg.openPath(targetPath);
    if (result) {
      setScanError(`${failurePrefix}${result}`);
      pushLog(`${failurePrefix}${result}`, 'error');
    }
  }

  async function loadOutputTree(entryId: string, rootDir: string, silent = false): Promise<void> {
    const version = ++outputTreeLoadVersionRef.current;
    setOutputTreeEntryId(entryId);
    setOutputTreeRootDir(rootDir);
    setOutputTreeStatus('loading');
    setOutputTreeError(null);
    setOutputTreeRoot(null);
    setOutputTreeFileCount(0);
    setExpandedOutputPaths([]);
    setSelectedOutputPath(null);

    if (!silent) {
      pushLog(`${TEXT.loadTreeStart}${rootDir}`);
    }

    try {
      const result = await window.wxapkg.readOutputTree(rootDir);
      if (outputTreeLoadVersionRef.current !== version) {
        return;
      }

      setOutputTreeRoot(result.root);
      setOutputTreeFileCount(result.fileCount);
      setExpandedOutputPaths([result.root.absolutePath]);
      setSelectedOutputPath(result.root.absolutePath);
      setOutputTreeStatus(result.fileCount > 0 ? 'ready' : 'empty');
      setActiveTab('output');
      pushLog(`${TEXT.loadTreeSuccess}${rootDir}`, 'success');
    } catch (error) {
      if (outputTreeLoadVersionRef.current !== version) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setOutputTreeStatus('error');
      setOutputTreeError(message);
      setOutputTreeRoot(null);
      setOutputTreeFileCount(0);
      setExpandedOutputPaths([]);
      setSelectedOutputPath(null);
      setActiveTab('output');
      pushLog(`${TEXT.loadTreeFailed}${message}`, 'error');
    }
  }

  async function scanDefaultRoot(): Promise<void> {
    setIsScanning(true);
    setScanRootLabel(TEXT.defaultRoot);
    setScanError(null);
    pushLog(TEXT.defaultScanStart);

    try {
      applyEntries(await window.wxapkg.scanDefaultRoot(), TEXT.defaultScanDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setScanError(`${TEXT.scanFail}${message}`);
      pushLog(`${TEXT.scanFail}${message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  }

  async function pickScanRoot(): Promise<void> {
    setIsScanning(true);
    setScanError(null);
    pushLog(TEXT.inputDirOpen);

    try {
      const result = await window.wxapkg.pickScanRoot();
      if (!result) {
        pushLog(TEXT.importCancel);
        return;
      }

      setScanRootLabel(result.rootPath);
      applyEntries(result.entries, TEXT.inputDirDone);
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
    pushLog(TEXT.importOpen);

    try {
      const nextEntries = await window.wxapkg.pickInput();
      if (nextEntries.length === 0) {
        pushLog(TEXT.importCancel);
        return;
      }

      setScanRootLabel(TEXT.importInput);
      applyEntries(nextEntries, TEXT.importDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setScanError(`${TEXT.scanFail}${message}`);
      pushLog(`${TEXT.scanFail}${message}`, 'error');
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
    setScanError(null);
    pushLog(`${TEXT.pickOutputDone} ${nextOutputDir}`);
  }

  async function startUnpack(): Promise<void> {
    if (!selectedEntry || !outputDir.trim() || !resolvedWxid) {
      setScanError(TEXT.chooseFirst);
      return;
    }

    const jobId = crypto.randomUUID();
    const nextOutputDir = outputDir.trim();
    activeJobMetaRef.current = {
      entryId: selectedEntry.id,
      outputDir: nextOutputDir,
      wxid: resolvedWxid,
    };

    setOutputTreeEntryId(selectedEntry.id);
    setOutputTreeRootDir(nextOutputDir);
    resetOutputTree();
    setJob({
      ...EMPTY_JOB,
      entryId: selectedEntry.id,
      id: jobId,
      message: `${TEXT.submitJob}${resolvedWxid}`,
      outputDir: nextOutputDir,
      running: true,
      type: 'started',
      wxid: resolvedWxid,
    });
    setScanError(null);
    setActiveTab('logs');
    pushLog(`${TEXT.submitJob}${resolvedWxid}`);

    try {
      await window.wxapkg.startUnpack({
        appDir: selectedEntry.inputKind === 'appDir' ? selectedEntry.appDir : undefined,
        beautify,
        jobId,
        outputDir: nextOutputDir,
        packageFile: selectedEntry.inputKind === 'packageFile' ? (selectedEntry.packageFile ?? undefined) : undefined,
        wxid: resolvedWxid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJob({
        ...EMPTY_JOB,
        entryId: selectedEntry.id,
        error: message,
        id: jobId,
        message,
        outputDir: nextOutputDir,
        type: 'error',
        wxid: resolvedWxid,
      });
      pushLog(`${TEXT.startFail}${message}`, 'error');
    }
  }

  async function refreshOutputTree(): Promise<void> {
    if (!selectedEntry || !outputTreeRootDir || outputTreeEntryId !== selectedEntry.id) {
      return;
    }

    setActiveTab('output');
    await loadOutputTree(selectedEntry.id, outputTreeRootDir);
  }

  async function openOutputDirectory(): Promise<void> {
    const targetPath = job.outputDir ?? outputTreeRootDir ?? outputDir;
    if (!targetPath) {
      return;
    }

    await openPathWithFeedback(targetPath, '打开输出目录失败：');
  }

  async function openAppDir(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    await openPathWithFeedback(selectedEntry.appDir, '打开缓存目录失败：');
  }

  async function openSelectedOutputDirectory(pathOverride?: string): Promise<void> {
    const targetPath = pathOverride ?? (selectedOutputNode?.kind === 'directory' ? selectedOutputNode.absolutePath : null);
    if (!targetPath) {
      return;
    }

    await openPathWithFeedback(targetPath, '打开当前目录失败：');
  }

  async function cancelJob(): Promise<void> {
    if (!job.id || !job.running) {
      return;
    }

    await window.wxapkg.cancelJob(job.id);
  }

  async function copyValue(label: string, value: string | null): Promise<void> {
    if (!value) {
      return;
    }

    try {
      await copyToClipboard(value);
      pushLog(`${label}${TEXT.wxidCopied}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushLog(`${TEXT.copyFailed}${message}`, 'error');
    }
  }

  useEffect(() => {
    void scanDefaultRoot();
  }, []);

  useEffect(() => {
    setExpandedPackagePaths([packageTree.root.absolutePath]);
    setSelectedPackagePath(packageTree.root.absolutePath);

    if (!selectedEntry || outputTreeEntryId !== selectedEntry.id) {
      setActiveTab('packages');
    }
  }, [packageTree.root.absolutePath, outputTreeEntryId, selectedEntry?.id]);

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
          entryId: current.entryId,
          error: event.type === 'error' ? (event.payload?.error ?? event.message) : null,
          fileCount: event.payload?.fileCount ?? current.fileCount,
          id: event.jobId,
          message: event.message,
          outputDir: event.payload?.outputDir ?? current.outputDir,
          progress: Math.round(event.progress * 100),
          running: !['completed', 'cancelled', 'error'].includes(event.type),
          type: event.type,
          wxid: current.wxid,
        };
      });

      if (event.type === 'completed') {
        const activeJob = activeJobMetaRef.current;
        const nextOutputDir = event.payload?.outputDir ?? activeJob?.outputDir;
        const nextEntryId = activeJob?.entryId;
        if (nextEntryId && nextOutputDir) {
          void loadOutputTree(nextEntryId, nextOutputDir, true);
        }
      }

      pushLog(
        `${jobStatusText(event.type)}: ${event.message}`,
        event.type === 'error' ? 'error' : event.type === 'completed' ? 'success' : 'default',
      );
    });
  }, []);

  const previewActions: ActionItem[] = [
    {
      disabled: activeTab !== 'output' || !outputTreeRootDir || outputTreeEntryId !== selectedEntry?.id,
      label: TEXT.refreshTree,
      onSelect: refreshOutputTree,
    },
    {
      disabled: !selectedEntry,
      label: TEXT.openAppDir,
      onSelect: openAppDir,
    },
    {
      disabled: !(job.outputDir ?? outputTreeRootDir ?? outputDir),
      label: TEXT.finderOutput,
      onSelect: openOutputDirectory,
    },
    {
      disabled: !(activeTab === 'output' && selectedOutputNode?.kind === 'directory'),
      label: TEXT.finderCurrent,
      onSelect: () => openSelectedOutputDirectory(),
    },
    {
      disabled: !resolvedWxid,
      label: TEXT.copyWxid,
      onSelect: () => copyValue('wxid ', resolvedWxid),
    },
    {
      disabled: !selectedEntry,
      label: TEXT.copyPath,
      onSelect: () => copyValue('缓存路径 ', selectedEntry?.appDir ?? null),
    },
    {
      disabled: !(job.outputDir ?? outputTreeRootDir ?? outputDir),
      label: TEXT.copyOutput,
      onSelect: () => copyValue('输出路径 ', job.outputDir ?? outputTreeRootDir ?? outputDir),
    },
    {
      disabled: !job.running,
      label: TEXT.cancelJob,
      onSelect: cancelJob,
    },
  ];

  return (
    <div className="min-h-screen bg-[#ececec] px-3 py-3 text-foreground dark:bg-[#05070b]">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1760px] flex-col gap-3">
        <TopToolbar
          isScanning={isScanning}
          onChooseOutputDir={chooseOutputDir}
          onImportInput={importInput}
          onPickScanRoot={pickScanRoot}
          onToggleList={() => setIsListOpen(true)}
        />

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden min-h-0 xl:block">
            <ListPanel
              entries={entries}
              filteredEntries={filteredEntries}
              isScanning={isScanning}
              keyword={keyword}
              onKeywordChange={setKeyword}
              onSelectEntry={setSelectedId}
              selectedEntry={selectedEntry}
            />
          </div>

          <AnimatePresence>
            {isListOpen ? (
              <>
                <motion.button
                  animate={{ opacity: 1 }}
                  className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm xl:hidden"
                  initial={{ opacity: 0 }}
                  onClick={() => setIsListOpen(false)}
                  type="button"
                />
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="fixed inset-y-0 left-0 z-50 w-[min(92vw,22rem)] p-3 xl:hidden"
                  initial={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="relative h-full">
                    <ListPanel
                      entries={entries}
                      filteredEntries={filteredEntries}
                      isScanning={isScanning}
                      keyword={keyword}
                      onKeywordChange={setKeyword}
                      onSelectEntry={(entryId) => {
                        setSelectedId(entryId);
                        setIsListOpen(false);
                      }}
                      selectedEntry={selectedEntry}
                    />
                    <Button
                      className="absolute right-4 top-4 rounded-full xl:hidden"
                      onClick={() => setIsListOpen(false)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <X />
                    </Button>
                  </div>
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>

          <div className="flex min-h-0 flex-col gap-3">
            <InfoStrip
              beautify={beautify}
              canStart={canStart}
              job={job}
              manualWxid={manualWxid}
              onBeautifyChange={setBeautify}
              onManualWxidChange={setManualWxid}
              onStartUnpack={startUnpack}
              outputDir={outputDir}
              resolvedWxid={resolvedWxid}
              scanRootLabel={scanRootLabel}
              selectedEntry={selectedEntry}
              selectedNode={selectedPreviewNode}
              treeStatus={hasOutputTree ? outputTreeStatus : 'idle'}
            />

            {scanError ? (
              <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                {scanError}
              </div>
            ) : null}

            <PreviewTabs
              actions={previewActions}
              activeTab={activeTab}
              logs={logs}
              onChange={setActiveTab}
              onOpenOutputDir={openSelectedOutputDirectory}
              onOpenOutputDirectory={openOutputDirectory}
              onSelectOutputNode={setSelectedOutputPath}
              onSelectPackageNode={setSelectedPackagePath}
              onToggleOutputNode={(path) => {
                setExpandedOutputPaths((current) => (
                  current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
                ));
              }}
              onTogglePackageNode={(path) => {
                setExpandedPackagePaths((current) => (
                  current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
                ));
              }}
              outputRoot={hasOutputTree ? outputTreeRoot : null}
              outputRows={hasOutputTree ? outputRows : []}
              outputSelectedPath={selectedOutputPath}
              outputStatus={hasOutputTree ? outputTreeStatus : 'idle'}
              packageRoot={selectedEntry ? packageTree.root : null}
              packageRows={selectedEntry ? packageRows : []}
              packageSelectedPath={selectedPackagePath}
              selectedEntry={selectedEntry}
              treeError={outputTreeError}
              treeFileCount={outputTreeFileCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
