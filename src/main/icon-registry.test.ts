import test from 'node:test';
import assert from 'node:assert/strict';

import { IconRegistry } from './icon-registry';

test('icon registry resolves tokens and preserves uniqueness', () => {
  const registry = new IconRegistry();

  const first = registry.register('C:\\icons\\one.png');
  const second = registry.register('C:\\icons\\two.png');

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.equal(registry.resolve(first), 'C:\\icons\\one.png');
  assert.equal(registry.resolve(second), 'C:\\icons\\two.png');
  assert.equal(registry.resolve('missing-token'), null);
});
