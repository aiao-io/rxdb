import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('性能门禁串行执行，避免同一 runner 上的其他测点污染采样', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci-template.yml', import.meta.url), 'utf8');
  const command = workflow.split('\n').find(line => line.includes('run-many -t search-ci bench-working-tree'));

  assert.ok(command, '缺少 benchmark 门禁');
  assert.match(command, /--parallel=1(?:\s|$)/);
});
