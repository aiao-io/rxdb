import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('builds workspace packages before demo applications', async () => {
  const source = await readFile(new URL('./build-website.mjs', import.meta.url), 'utf8');
  const packagesIndex = source.indexOf("name: '构建核心库'");

  assert.notEqual(packagesIndex, -1);
  for (const demo of ['React', 'Vue', 'Angular']) {
    const demoIndex = source.indexOf(`name: '构建 ${demo} 演示'`);

    assert.notEqual(demoIndex, -1);
    assert.ok(packagesIndex < demoIndex, `workspace packages must be built before the ${demo} demo`);
  }
});
