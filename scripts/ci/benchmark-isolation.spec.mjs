import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('性能门禁串行执行，避免同一 runner 上的其他测点污染采样', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci-template.yml', import.meta.url), 'utf8');
  const command = workflow.split('\n').find(line => line.includes('run-many -t search-ci bench-working-tree'));

  assert.ok(command, '缺少 benchmark 门禁');
  assert.match(command, /--parallel=1(?:\s|$)/);
});

const nodeOptionsAt = (source, indent) => {
  const line = source.match(new RegExp(`^ {${indent}}NODE_OPTIONS:[ \\t]*(.*)$`, 'm'));
  return line?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
};

const measurementNodeOptions = (source, jobName, command) => {
  const job = source.match(new RegExp(`\\n  ${jobName}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z][\\w-]*:|$)`))?.[1];
  assert.ok(job, `缺少 ${jobName} job`);
  const step = job.split(/^ {6}- /m).find(block => block.includes(command));
  assert.ok(step, `缺少 ${command} 测量步骤`);
  return nodeOptionsAt(step, 10) ?? nodeOptionsAt(job, 6) ?? nodeOptionsAt(source, 2) ?? '';
};

test('相对门禁和 reference 冻结使用相同 Node 启动选项，构建堆配置不能污染采样', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci-template.yml', import.meta.url), 'utf8');
  const freeze = await readFile(new URL('../../.github/workflows/bench-freeze.yml', import.meta.url), 'utf8');
  const candidate = measurementNodeOptions(workflow, 'benchmark', 'run-many -t search-ci bench-working-tree');
  const reference = measurementNodeOptions(freeze, 'freeze', 'freeze-working-tree-reference.ts --new-profile');

  assert.equal(candidate, reference);
});
