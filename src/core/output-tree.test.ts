import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readOutputTree, resolveAllowedOutputTreePath } from './output-tree';

async function createFile(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
}

test('readOutputTree builds a sorted directory tree with file counts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wxapkg-tree-'));

  try {
    await createFile(path.join(tempRoot, 'pages', 'index.js'), 'console.log("hi")');
    await createFile(path.join(tempRoot, 'pages', 'index.json'), '{"name":"demo"}');
    await createFile(path.join(tempRoot, 'app.json'), '{"root":true}');

    const tree = await readOutputTree(tempRoot);

    assert.equal(tree.fileCount, 3);
    assert.equal(tree.root.kind, 'directory');
    assert.equal(tree.root.relativePath, '.');
    assert.equal(tree.root.children?.[0]?.name, 'pages');
    assert.equal(tree.root.children?.[1]?.name, 'app.json');
    assert.equal(tree.root.children?.[0]?.children?.[0]?.name, 'index.js');
    assert.equal(tree.root.children?.[0]?.children?.[1]?.extension, '.json');
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});

test('resolveAllowedOutputTreePath only allows output roots and descendants', () => {
  const root = path.resolve('/tmp/demo-output');
  const nested = path.join(root, 'wxid', 'pages');

  assert.equal(resolveAllowedOutputTreePath([root], root), root);
  assert.equal(resolveAllowedOutputTreePath([root], nested), nested);
  assert.throws(
    () => resolveAllowedOutputTreePath([root], '/tmp/other-output'),
    /Blocked output tree request outside allowed roots/,
  );
});
