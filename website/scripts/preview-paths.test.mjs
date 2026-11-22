import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { matchRedirect, resolvePreviewPath, resolveWithin } from './preview-paths.mjs';

test('resolves static paths within the build root', async t => {
  const root = await mkdtemp(join(tmpdir(), 'preview-paths-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'guide.html'), 'guide');

  assert.equal(resolvePreviewPath(root, '/guide'), join(root, 'guide.html'));
  assert.equal(resolvePreviewPath(root, '/assets/app.js'), join(root, 'assets/app.js'));
});

test('rejects traversal and invalid separators', () => {
  const root = join(tmpdir(), 'preview-root');
  const payloads = ['/../../package.json', '/../secret', '/..\\secret', '/\0secret'];
  for (const payload of payloads) assert.equal(resolveWithin(root, payload), null);
});

test('预览按路径段匹配英文演示别名，保留资源路径和编码', () => {
  const rules = [{ from: '/en/demo/*', to: '/demo/:splat', status: 301 }];
  assert.deepEqual(matchRedirect('/en/demo/vue/assets/my%20file.js', rules), {
    to: '/demo/vue/assets/my%20file.js',
    status: 301
  });
  assert.equal(matchRedirect('/en/demos/vue', rules), null);
});
