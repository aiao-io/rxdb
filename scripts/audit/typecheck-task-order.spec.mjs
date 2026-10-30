import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const nxCli = createRequire(import.meta.url).resolve('nx/bin/nx');

const predecessorsOf = (dependencies, task) => {
  const pending = [task];
  const predecessors = new Set();
  for (const current of pending) {
    for (const { id } of dependencies[current] ?? []) {
      if (predecessors.has(id)) continue;
      predecessors.add(id);
      pending.push(id);
    }
  }
  return predecessors;
};

test('Angular 模型类型检查必须等引用项目完成类型声明写入', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'rxdb-typecheck-order-'));
  const graphPath = path.join(temporary, 'tasks.json');
  try {
    execFileSync(process.execPath, [nxCli, 'run', 'rxdb-model-angular:typecheck', `--graph=${graphPath}`], {
      cwd: workspaceRoot,
      env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true' },
      stdio: 'pipe'
    });
    const { dependencies } = JSON.parse(readFileSync(graphPath, 'utf8')).tasks;
    const predecessors = predecessorsOf(dependencies, 'rxdb-model-angular:typecheck');
    const referencedChecks = [
      'rxdb:typecheck',
      'rxdb-model:typecheck',
      'rxdb-angular:typecheck',
      'rxdb-test:typecheck'
    ];
    assert.deepEqual(
      referencedChecks.filter(task => !predecessors.has(task)),
      []
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
