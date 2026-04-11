import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface OutputTreeNode {
  absolutePath: string;
  children?: OutputTreeNode[];
  extension?: string | null;
  id: string;
  kind: 'directory' | 'file';
  mtimeMs: number;
  name: string;
  relativePath: string;
  size: number;
}

export interface OutputTreeResult {
  fileCount: number;
  root: OutputTreeNode;
}

function normalizeRelativePath(rootDir: string, targetPath: string): string {
  const relativePath = path.relative(rootDir, targetPath);
  return relativePath === '' ? '.' : relativePath;
}

function compareTreeNodes(left: OutputTreeNode, right: OutputTreeNode): number {
  if (left.kind !== right.kind) {
    return left.kind === 'directory' ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

async function buildTreeNode(
  rootDir: string,
  targetPath: string,
): Promise<{ fileCount: number; node: OutputTreeNode }> {
  const stats = await fs.stat(targetPath);
  const name = path.basename(targetPath);
  const relativePath = normalizeRelativePath(rootDir, targetPath);

  if (!stats.isDirectory()) {
    return {
      fileCount: 1,
      node: {
        absolutePath: targetPath,
        extension: path.extname(name).toLowerCase() || null,
        id: relativePath,
        kind: 'file',
        mtimeMs: stats.mtimeMs,
        name,
        relativePath,
        size: stats.size,
      },
    };
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const childResults = await Promise.all(
    entries.map(async (entry) => buildTreeNode(rootDir, path.join(targetPath, entry.name))),
  );
  const children = childResults.map((item) => item.node).sort(compareTreeNodes);
  const fileCount = childResults.reduce((count, item) => count + item.fileCount, 0);
  const size = childResults.reduce((total, item) => total + item.node.size, 0);

  return {
    fileCount,
    node: {
      absolutePath: targetPath,
      children,
      extension: null,
      id: relativePath,
      kind: 'directory',
      mtimeMs: stats.mtimeMs,
      name,
      relativePath,
      size,
    },
  };
}

export function resolveAllowedOutputTreePath(
  allowedRoots: Iterable<string>,
  requestedPath: string,
): string {
  const resolvedRequestedPath = path.resolve(requestedPath);

  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);
    if (
      resolvedRequestedPath === resolvedRoot ||
      resolvedRequestedPath.startsWith(`${resolvedRoot}${path.sep}`)
    ) {
      return resolvedRequestedPath;
    }
  }

  throw new Error('Blocked output tree request outside allowed roots');
}

export async function readOutputTree(rootDir: string): Promise<OutputTreeResult> {
  const resolvedRoot = path.resolve(rootDir);
  const stats = await fs.stat(resolvedRoot).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Output directory not found: ${resolvedRoot}`);
  }

  const result = await buildTreeNode(resolvedRoot, resolvedRoot);
  return {
    fileCount: result.fileCount,
    root: result.node,
  };
}
