import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { unpackRequest } from './unpack';

const AES_IV = Buffer.from('the iv: 16 bytes', 'utf8');
const PBKDF2_SALT = Buffer.from('saltiest', 'utf8');

function buildArchive(files: Array<{ content: Buffer; name: string }>): Buffer {
  const fileRecords = files.map((file) => ({
    content: file.content,
    name: Buffer.from(file.name, 'utf8'),
  }));

  const indexLength = fileRecords.reduce(
    (length, file) => length + 4 + file.name.length + 4 + 4,
    0,
  );
  const bodyLength = fileRecords.reduce((length, file) => length + file.content.length, 0);
  const headerLength = 1 + 4 + 4 + 4 + 1 + 4;
  const archive = Buffer.alloc(headerLength + indexLength + bodyLength);

  let offset = 0;
  archive.writeUInt8(0xbe, offset);
  offset += 1;
  archive.writeUInt32BE(0, offset);
  offset += 4;
  archive.writeUInt32BE(indexLength, offset);
  offset += 4;
  archive.writeUInt32BE(bodyLength, offset);
  offset += 4;
  archive.writeUInt8(0xed, offset);
  offset += 1;
  archive.writeUInt32BE(fileRecords.length, offset);
  offset += 4;

  let bodyOffset = headerLength + indexLength;
  for (const file of fileRecords) {
    archive.writeUInt32BE(file.name.length, offset);
    offset += 4;
    file.name.copy(archive, offset);
    offset += file.name.length;
    archive.writeUInt32BE(bodyOffset, offset);
    offset += 4;
    archive.writeUInt32BE(file.content.length, offset);
    offset += 4;
    file.content.copy(archive, bodyOffset);
    bodyOffset += file.content.length;
  }

  return archive;
}

function encryptArchive(wxid: string, archive: Buffer): Buffer {
  const header = Buffer.alloc(1024);
  archive.copy(header, 0, 0, Math.min(archive.length, 1023));

  const key = pbkdf2Sync(wxid, PBKDF2_SALT, 1000, 32, 'sha1');
  const cipher = createCipheriv('aes-256-cbc', key, AES_IV);
  cipher.setAutoPadding(false);
  const encryptedHeader = Buffer.concat([cipher.update(header), cipher.final()]);

  const tail = archive.subarray(1023);
  const encryptedTail = Buffer.alloc(tail.length);
  const xorKey = Buffer.from(wxid, 'utf8').at(-2) ?? 0x66;

  for (let index = 0; index < tail.length; index += 1) {
    encryptedTail[index] = tail[index] ^ xorKey;
  }

  return Buffer.concat([Buffer.alloc(6), encryptedHeader, encryptedTail]);
}

async function createPackage(
  appDir: string,
  wxid: string,
  files: Array<{ content: Buffer; name: string }>,
): Promise<string> {
  const archive = buildArchive(files);
  const encrypted = encryptArchive(wxid, archive);
  const targetPath = path.join(appDir, 'main.wxapkg');
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(targetPath, encrypted);
  return targetPath;
}

async function createPlainPackage(
  appDir: string,
  files: Array<{ content: Buffer; name: string }>,
): Promise<string> {
  const archive = buildArchive(files);
  const targetPath = path.join(appDir, 'plain.wxapkg');
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(targetPath, archive);
  return targetPath;
}

test('unpack request decrypts archives and beautifies supported files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wxapkg-unpack-'));

  try {
    const wxid = 'wx1234567890abcdef';
    const appDir = path.join(tempRoot, 'packages', wxid);
    const outputRoot = path.join(tempRoot, 'output');
    await createPackage(appDir, wxid, [
      {
        content: Buffer.from('{"name":"demo","version":1}', 'utf8'),
        name: 'app.json',
      },
      {
        content: Buffer.from('function demo(){return 1;}', 'utf8'),
        name: 'pages/index.js',
      },
      {
        content: Buffer.from('<view><text>Hello</text></view>', 'utf8'),
        name: 'pages/index.html',
      },
      {
        content: Buffer.alloc(1500, 'x'),
        name: 'assets/blob.bin',
      },
    ]);

    const events: string[] = [];
    const result = await unpackRequest(
      {
        appDir,
        beautify: true,
        jobId: 'job-1',
        outputDir: outputRoot,
        wxid,
      },
      (event) => {
        events.push(event.type);
      },
    );

    assert.equal(result.fileCount, 4);
    assert.ok(events.includes('started'));
    assert.ok(events.includes('progress'));
    assert.ok(events.includes('completed'));

    const jsonOutput = await fs.readFile(path.join(outputRoot, wxid, 'app.json'), 'utf8');
    const jsOutput = await fs.readFile(path.join(outputRoot, wxid, 'pages', 'index.js'), 'utf8');

    assert.match(jsonOutput, /"name": "demo"/);
    assert.match(jsOutput, /function demo\(\)/);
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});

test('unpack request rejects archive path traversal', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wxapkg-traversal-'));

  try {
    const wxid = 'wxabcdefabcdefabcd';
    const appDir = path.join(tempRoot, 'packages', wxid);
    const outputRoot = path.join(tempRoot, 'output');
    await createPackage(appDir, wxid, [
      {
        content: Buffer.alloc(1500, 'z'),
        name: '../escape.txt',
      },
    ]);

    await assert.rejects(
      unpackRequest(
        {
          appDir,
          beautify: false,
          jobId: 'job-2',
          outputDir: outputRoot,
          wxid,
        },
        () => undefined,
      ),
      /Invalid archive path/,
    );
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});

test('unpack request supports plain wxapkg archives without decryption', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wxapkg-plain-'));

  try {
    const wxid = 'wx1234567890abcdef';
    const appDir = path.join(tempRoot, 'packages', wxid);
    const outputRoot = path.join(tempRoot, 'output');
    await createPlainPackage(appDir, [
      {
        content: Buffer.from('{"plain":true}', 'utf8'),
        name: 'app.json',
      },
    ]);

    const result = await unpackRequest(
      {
        appDir,
        beautify: true,
        jobId: 'job-plain',
        outputDir: outputRoot,
        wxid,
      },
      () => undefined,
    );

    assert.equal(result.fileCount, 1);

    const jsonOutput = await fs.readFile(path.join(outputRoot, wxid, 'app.json'), 'utf8');
    assert.match(jsonOutput, /"plain": true/);
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});
