import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { IMAGE_EXTENSIONS } from '../shared/constants';
import type { PackageEntry, ScanEntry, ScanEntryInputKind, ScanEntrySource } from '../shared/types';
import {
  deriveAppletContext,
  findWxidAncestorDir,
  inferWxidFromPath,
  isWxid,
} from './path-utils';

async function readDirectoryNames(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function findWxapkgFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.wxapkg') {
        results.push(fullPath);
      }
    }
  }

  results.sort((left, right) => left.localeCompare(right));
  return results;
}

async function buildPackageEntries(filePaths: string[], baseDir: string): Promise<PackageEntry[]> {
  const packageEntries = await Promise.all(
    filePaths.map(async (filePath) => {
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(baseDir, filePath) || path.basename(filePath);
      return {
        mtimeMs: stats.mtimeMs,
        path: filePath,
        relativePath,
        size: stats.size,
      };
    }),
  );

  return packageEntries.sort((left, right) => left.path.localeCompare(right.path));
}

async function resolveIconPath(
  iconDir: string | null,
  wxid: string | null,
): Promise<string | null> {
  if (!iconDir || !wxid) {
    return null;
  }

  const candidates = new Set<string>([iconDir]);
  const baseName = path.basename(iconDir).toLowerCase();
  if (baseName === 'icon') {
    candidates.add(path.join(path.dirname(iconDir), 'icons'));
  } else if (baseName === 'icons') {
    candidates.add(path.join(path.dirname(iconDir), 'icon'));
  }

  for (const dir of candidates) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const match = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            (entry.name.toLowerCase() === `${wxid.toLowerCase()}${path.extname(entry.name).toLowerCase()}` ||
              entry.name.toLowerCase().startsWith(`${wxid.toLowerCase()}_`)) &&
            IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
        )
        .sort((left, right) => left.name.localeCompare(right.name))[0];

      if (match) {
        return path.join(dir, match.name);
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function createScanEntry(args: {
  appDir: string;
  inputKind: ScanEntryInputKind;
  packageFile: string | null;
  source: ScanEntrySource;
  wxapkgFiles: string[];
  wxid: string | null;
}): Promise<ScanEntry> {
  const appletContext = deriveAppletContext(args.appDir);
  const iconPath = await resolveIconPath(appletContext.iconDir, args.wxid);

  return {
    appDir: args.appDir,
    iconPath,
    iconUrl: null,
    id: randomUUID(),
    inputKind: args.inputKind,
    packageFile: args.packageFile,
    packagesRoot: appletContext.packagesRoot,
    source: args.source,
    userId: appletContext.userId,
    userRoot: appletContext.userRoot,
    wxapkgFiles: await buildPackageEntries(args.wxapkgFiles, args.appDir),
    wxid: args.wxid,
  };
}

export async function scanDefaultUsersRoot(root: string): Promise<ScanEntry[]> {
  const stats = await fs.stat(root).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Default scan root not found: ${root}`);
  }

  const results: ScanEntry[] = [];
  const rootDirNames = await readDirectoryNames(root);
  const looksLikePackagesRoot = rootDirNames.some((name) => isWxid(name));

  if (looksLikePackagesRoot) {
    for (const appDirName of rootDirNames) {
      if (!isWxid(appDirName)) {
        continue;
      }

      const appDir = path.join(root, appDirName);
      const packageFiles = await findWxapkgFiles(appDir);
      if (packageFiles.length === 0) {
        continue;
      }

      results.push(
        await createScanEntry({
          appDir,
          inputKind: 'appDir',
          packageFile: null,
          source: 'default-scan',
          wxapkgFiles: packageFiles,
          wxid: appDirName,
        }),
      );
    }
  }

  const userDirs = rootDirNames;

  for (const userDir of userDirs) {
    const userRoot = path.join(root, userDir);
    const packagesRoot = path.join(userRoot, 'applet', 'packages');
    const packagesStats = await fs.stat(packagesRoot).catch(() => null);
    if (!packagesStats?.isDirectory()) {
      continue;
    }

    const appDirs = await readDirectoryNames(packagesRoot);
    for (const appDirName of appDirs) {
      if (!isWxid(appDirName)) {
        continue;
      }

      const appDir = path.join(packagesRoot, appDirName);
      const packageFiles = await findWxapkgFiles(appDir);
      if (packageFiles.length === 0) {
        continue;
      }

      results.push(
        await createScanEntry({
          appDir,
          inputKind: 'appDir',
          packageFile: null,
          source: 'default-scan',
          wxapkgFiles: packageFiles,
          wxid: appDirName,
        }),
      );
    }
  }

  return results.sort((left, right) => {
    const leftKey = left.wxid ?? left.appDir;
    const rightKey = right.wxid ?? right.appDir;
    return leftKey.localeCompare(rightKey);
  });
}

export async function scanManualInput(inputPath: string): Promise<ScanEntry[]> {
  const resolvedPath = path.resolve(inputPath);
  const stats = await fs.stat(resolvedPath).catch(() => null);

  if (!stats) {
    throw new Error(`Input path not found: ${resolvedPath}`);
  }

  if (stats.isFile()) {
    if (path.extname(resolvedPath).toLowerCase() !== '.wxapkg') {
      throw new Error('Only .wxapkg files can be imported directly');
    }

    const wxid = inferWxidFromPath(resolvedPath);
    const appDir = findWxidAncestorDir(resolvedPath) ?? path.dirname(resolvedPath);

    return [
      await createScanEntry({
        appDir,
        inputKind: 'packageFile',
        packageFile: resolvedPath,
        source: 'manual',
        wxapkgFiles: [resolvedPath],
        wxid,
      }),
    ];
  }

  if (!stats.isDirectory()) {
    throw new Error('Selected input must be a directory or a .wxapkg file');
  }

  const packageFiles = await findWxapkgFiles(resolvedPath);
  if (packageFiles.length === 0) {
    throw new Error(`No .wxapkg files found in ${resolvedPath}`);
  }

  const grouped = new Map<
    string,
    {
      appDir: string;
      packageFiles: string[];
      wxid: string | null;
    }
  >();

  for (const filePath of packageFiles) {
    const appDir = findWxidAncestorDir(filePath) ?? path.dirname(filePath);
    const wxid = inferWxidFromPath(filePath);
    const key = `${appDir}::${wxid ?? 'manual'}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.packageFiles.push(filePath);
      continue;
    }

    grouped.set(key, {
      appDir,
      packageFiles: [filePath],
      wxid,
    });
  }

  const results = await Promise.all(
    Array.from(grouped.values()).map((group) =>
      createScanEntry({
        appDir: group.appDir,
        inputKind: group.packageFiles.length === 1 && !group.wxid ? 'packageFile' : 'appDir',
        packageFile:
          group.packageFiles.length === 1 && !group.wxid ? group.packageFiles[0] : null,
        source: 'manual',
        wxapkgFiles: group.packageFiles,
        wxid: group.wxid,
      }),
    ),
  );

  return results.sort((left, right) => {
    const leftKey = left.wxid ?? left.appDir;
    const rightKey = right.wxid ?? right.appDir;
    return leftKey.localeCompare(rightKey);
  });
}
