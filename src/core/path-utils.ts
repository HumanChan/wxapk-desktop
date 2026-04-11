import path from 'node:path';

const WXID_PATTERN = /^wx[0-9a-f]{16,18}$/i;

export interface AppletContext {
  iconDir: string | null;
  packagesRoot: string | null;
  userId: string | null;
  userRoot: string | null;
}

export function isWxid(value: string): boolean {
  return WXID_PATTERN.test(value);
}

export function inferWxidFromPath(targetPath: string): string | null {
  const segments = path.resolve(targetPath).split(path.sep).reverse();

  for (const segment of segments) {
    if (isWxid(segment)) {
      return segment;
    }
  }

  return null;
}

export function findWxidAncestorDir(targetPath: string): string | null {
  let current = path.resolve(targetPath);

  for (;;) {
    const basename = path.basename(current);
    if (isWxid(basename)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return null;
}

export function deriveAppletContext(appDir: string): AppletContext {
  const segments = path.resolve(appDir).split(path.sep);
  let packagesIndex = -1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (
      segments[index]?.toLowerCase() === 'packages' &&
      index > 0 &&
      segments[index - 1]?.toLowerCase() === 'applet'
    ) {
      packagesIndex = index;
      break;
    }
  }

  if (packagesIndex < 1) {
    return {
      iconDir: null,
      packagesRoot: null,
      userId: null,
      userRoot: null,
    };
  }

  const userRoot = segments.slice(0, packagesIndex - 1).join(path.sep);
  const packagesRoot = segments.slice(0, packagesIndex + 1).join(path.sep);

  return {
    iconDir: path.join(userRoot, 'applet', 'icon'),
    packagesRoot,
    userId: path.basename(userRoot) || null,
    userRoot,
  };
}

export function sanitizeArchiveRelativePath(
  archiveName: string,
): string | null {
  const normalized = archiveName.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const trimmed = normalized.replace(/^\/+/, '');
  const parts = trimmed
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (
    parts.length === 0 ||
    parts.some(
      (part) =>
        part === '.' || part === '..' || part.includes('\0') || part === '',
    )
  ) {
    return null;
  }

  return path.join(...parts);
}

export function ensureSafeOutputPath(
  outputRoot: string,
  relativePath: string,
): string {
  const resolvedRoot = path.resolve(outputRoot);
  const resolvedOutput = path.resolve(resolvedRoot, relativePath);

  if (
    resolvedOutput !== resolvedRoot &&
    !resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Refusing to write outside output directory: ${relativePath}`);
  }

  return resolvedOutput;
}
