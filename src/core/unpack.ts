import { promises as fs } from 'node:fs';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import path from 'node:path';

import type { JobEvent, UnpackRequest } from '../shared/types';
import { beautifyFileContent } from './beautify';
import { ensureSafeOutputPath, sanitizeArchiveRelativePath } from './path-utils';

const AES_IV = Buffer.from('the iv: 16 bytes', 'utf8');
const PBKDF2_SALT = Buffer.from('saltiest', 'utf8');
const WXAPKG_HEADER_MARK = 0xbe;
const WXAPKG_FOOTER_MARK = 0xed;
const MAX_NAME_LENGTH = 10 << 20;

interface ParsedArchiveEntry {
  name: string;
  offset: number;
  size: number;
}

interface ArchiveManifest {
  decryptedData: Buffer;
  entries: ParsedArchiveEntry[];
  packageFile: string;
  subOutputDir: string;
}

class BufferCursor {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readBytes(length: number): Buffer {
    const end = this.offset + length;
    if (end > this.buffer.length) {
      throw new Error('Unexpected end of archive while reading bytes');
    }

    const slice = this.buffer.subarray(this.offset, end);
    this.offset = end;
    return slice;
  }

  readUInt8(): number {
    return this.readBytes(1).readUInt8(0);
  }

  readUInt32BE(): number {
    return this.readBytes(4).readUInt32BE(0);
  }
}

function toJobEvent(
  jobId: string,
  type: JobEvent['type'],
  progress: number,
  message: string,
  payload?: JobEvent['payload'],
): JobEvent {
  return {
    jobId,
    message,
    payload,
    progress: Math.max(0, Math.min(1, progress)),
    type,
  };
}

export function decryptWxapkg(wxid: string, encryptedData: Buffer): Buffer {
  if (encryptedData.length < 1030) {
    throw new Error('Encrypted wxapkg file is too small');
  }

  const key = pbkdf2Sync(wxid, PBKDF2_SALT, 1000, 32, 'sha1');
  const decipher = createDecipheriv('aes-256-cbc', key, AES_IV);
  decipher.setAutoPadding(false);

  const decryptedHead = Buffer.concat([
    decipher.update(encryptedData.subarray(6, 1030)),
    decipher.final(),
  ]);

  if (decryptedHead.length !== 1024) {
    throw new Error('Failed to decrypt wxapkg header');
  }

  const tail = Buffer.alloc(encryptedData.length - 1030);
  const xorKey = Buffer.from(wxid, 'utf8').at(-2) ?? 0x66;

  for (let index = 0; index < tail.length; index += 1) {
    tail[index] = encryptedData[1030 + index] ^ xorKey;
  }

  return Buffer.concat([decryptedHead.subarray(0, 1023), tail]);
}

export function parseDecryptedArchive(decryptedData: Buffer): ParsedArchiveEntry[] {
  const cursor = new BufferCursor(decryptedData);

  const firstMark = cursor.readUInt8();
  cursor.readUInt32BE();
  cursor.readUInt32BE();
  cursor.readUInt32BE();
  const lastMark = cursor.readUInt8();

  if (firstMark !== WXAPKG_HEADER_MARK || lastMark !== WXAPKG_FOOTER_MARK) {
    throw new Error('Invalid wxapkg archive header');
  }

  const fileCount = cursor.readUInt32BE();
  const entries: ParsedArchiveEntry[] = [];

  for (let index = 0; index < fileCount; index += 1) {
    const nameLength = cursor.readUInt32BE();
    if (nameLength > MAX_NAME_LENGTH) {
      throw new Error('Archive entry name is unreasonably large');
    }

    const name = cursor.readBytes(nameLength).toString('utf8');
    const offset = cursor.readUInt32BE();
    const size = cursor.readUInt32BE();

    if (offset < 0 || size < 0 || offset + size > decryptedData.length) {
      throw new Error(`Archive entry is out of bounds: ${name}`);
    }

    entries.push({ name, offset, size });
  }

  return entries;
}

async function resolvePackageFiles(request: UnpackRequest): Promise<string[]> {
  if (request.packageFile) {
    return [path.resolve(request.packageFile)];
  }

  if (!request.appDir) {
    throw new Error('Unpack request must include an app directory or a package file');
  }

  const results: string[] = [];
  const pending = [path.resolve(request.appDir)];

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

async function buildManifests(request: UnpackRequest): Promise<ArchiveManifest[]> {
  const packageFiles = await resolvePackageFiles(request);
  if (packageFiles.length === 0) {
    throw new Error('No .wxapkg files found for the selected entry');
  }

  const jobOutputRoot = path.resolve(request.outputDir, request.wxid);
  const appRoot = request.appDir ? path.resolve(request.appDir) : null;

  return Promise.all(
    packageFiles.map(async (packageFile) => {
      const encryptedData = await fs.readFile(packageFile);
      const decryptedData = decryptWxapkg(request.wxid, encryptedData);
      const entries = parseDecryptedArchive(decryptedData);
      const relativeParent = appRoot
        ? path.relative(appRoot, path.dirname(packageFile))
        : '.';
      const subOutputDir =
        !relativeParent || relativeParent === '.'
          ? jobOutputRoot
          : path.join(jobOutputRoot, relativeParent);

      return {
        decryptedData,
        entries,
        packageFile,
        subOutputDir,
      };
    }),
  );
}

export async function unpackRequest(
  request: UnpackRequest,
  onEvent: (event: JobEvent) => void,
): Promise<{ fileCount: number; outputDir: string }> {
  onEvent(
    toJobEvent(
      request.jobId,
      'started',
      0,
      `\u6b63\u5728\u51c6\u5907 ${request.wxid}`,
    ),
  );

  const manifests = await buildManifests(request);
  const totalFiles = manifests.reduce(
    (count, manifest) => count + manifest.entries.length,
    0,
  );
  const outputDir = path.resolve(request.outputDir, request.wxid);

  await fs.mkdir(outputDir, { recursive: true });

  let processedFiles = 0;
  for (const manifest of manifests) {
    onEvent(
      toJobEvent(
        request.jobId,
        'log',
        processedFiles / Math.max(totalFiles, 1),
        `\u6b63\u5728\u5904\u7406 ${path.basename(manifest.packageFile)}`,
      ),
    );

    for (const entry of manifest.entries) {
      const safeRelativePath = sanitizeArchiveRelativePath(entry.name);
      if (!safeRelativePath) {
        throw new Error(`Invalid archive path: ${entry.name}`);
      }

      const targetPath = ensureSafeOutputPath(
        manifest.subOutputDir,
        safeRelativePath,
      );
      const fileBuffer = manifest.decryptedData.subarray(
        entry.offset,
        entry.offset + entry.size,
      );
      const outputBuffer = request.beautify
        ? beautifyFileContent(targetPath, fileBuffer)
        : fileBuffer;

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, outputBuffer);

      processedFiles += 1;
      onEvent(
        toJobEvent(
          request.jobId,
          'progress',
          processedFiles / Math.max(totalFiles, 1),
          `\u5df2\u5199\u51fa ${safeRelativePath}`,
          {
            processedFiles,
            totalFiles,
          },
        ),
      );
    }
  }

  onEvent(
    toJobEvent(
      request.jobId,
      'completed',
      1,
      `\u89e3\u5305\u5b8c\u6210 ${request.wxid}`,
      {
        fileCount: processedFiles,
        outputDir,
        processedFiles,
        totalFiles,
      },
    ),
  );

  return {
    fileCount: processedFiles,
    outputDir,
  };
}
