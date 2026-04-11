import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanDefaultUsersRoot, scanManualInput } from './scanner';

async function createFile(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
}

test('default scan finds wxapps and matches icons by wxid prefix', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wxapkg-scan-'));

  try {
    const userRoot = path.join(tempRoot, 'ad05b85e6390be11d299283dd496c384');
    const appOne = 'wx0c7eaf9ca61fa356';
    const appTwo = 'wx25f982a55e60a540';

    await createFile(
      path.join(userRoot, 'applet', 'packages', appOne, 'main.wxapkg'),
      'fake',
    );
    await createFile(
      path.join(userRoot, 'applet', 'packages', appTwo, 'sub', 'pack.wxapkg'),
      'fake',
    );
    await createFile(
      path.join(
        userRoot,
        'applet',
        'icon',
        `${appOne}_83a970a2e6bce8dd3182e4c9ec93d8c2.png`,
      ),
      'icon',
    );

    const entries = await scanDefaultUsersRoot(tempRoot);

    assert.equal(entries.length, 2);
    const first = entries.find((entry) => entry.wxid === appOne);
    const second = entries.find((entry) => entry.wxid === appTwo);
    assert.ok(first);
    assert.ok(second);
    assert.ok(first.iconPath?.endsWith('.png'));
    assert.equal(second.iconPath, null);
    assert.equal(first.wxapkgFiles.length, 1);
    assert.equal(second.wxapkgFiles.length, 1);
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});

test('manual scan can group wxapkg files from an arbitrary directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wxapkg-manual-'));

  try {
    const appId = 'wx1234567890abcdef';
    await createFile(
      path.join(tempRoot, 'nested', appId, 'part1.wxapkg'),
      'fake',
    );
    await createFile(
      path.join(tempRoot, 'nested', appId, 'sub', 'part2.wxapkg'),
      'fake',
    );

    const entries = await scanManualInput(tempRoot);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].wxid, appId);
    assert.equal(entries[0].inputKind, 'appDir');
    assert.equal(entries[0].wxapkgFiles.length, 2);
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});
