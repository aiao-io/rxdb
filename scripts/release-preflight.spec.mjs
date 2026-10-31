import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assertCleanSnapshot,
  assertStableInputs,
  normalizeRegistryArgs,
  parseArgs,
  runPreflight
} from './release-preflight.mjs';

const snapshot = (overrides = {}) => ({
  head: 'abc',
  status: '',
  migrationManifestDigest: 'manifest',
  packageVersion: '0.0.28',
  releaseProjectsDigest: 'projects',
  ...overrides
});

test('parseArgs 只解析前置参数并透传发布命令', () => {
  assert.deepEqual(parseArgs(['--', 'pnpm', 'exec', 'nx', 'release', 'publish']), {
    help: false,
    dryRun: false,
    command: ['pnpm', 'exec', 'nx', 'release', 'publish']
  });
  assert.equal(parseArgs(['--dry-run', '--', 'echo', 'ok']).dryRun, true);
  assert.equal(parseArgs(['--', 'echo', '--dry-run']).dryRun, true);
  assert.throws(() => parseArgs(['--skip-preflight']), /未知参数/);
});

test('发布命令允许调用方用最后一个 registry 覆盖默认值', () => {
  assert.deepEqual(
    normalizeRegistryArgs([
      'exec',
      'nx',
      'release',
      'publish',
      '--registry=https://registry.npmjs.org',
      '--registry=http://localhost:4873'
    ]),
    ['exec', 'nx', 'release', 'publish', '--registry=http://localhost:4873']
  );
});

test('脏工作区在任何发布校验前就被拒绝', () => {
  assert.throws(() => assertCleanSnapshot(snapshot({ status: ' M package.json' })), /工作区必须干净/);
});

test('发布校验期间提交、清单或版本变化都会失效', () => {
  for (const field of ['head', 'status', 'migrationManifestDigest', 'packageVersion', 'releaseProjectsDigest']) {
    assert.throws(
      () => assertStableInputs(snapshot(), snapshot({ [field]: `${field}-changed` })),
      new RegExp(field === 'head' ? '提交' : field === 'status' ? '工作区' : '发布校验期间发生变化')
    );
  }
});

test('三个门禁按顺序执行，全部通过后才返回产物快照', () => {
  const calls = [];
  const result = runPreflight({
    cwd: '/workspace',
    snapshot: () => snapshot(),
    runCommand: (command, args, cwd) => {
      calls.push([command, args, cwd]);
      return { status: 0 };
    }
  });

  assert.equal(result.head, 'abc');
  assert.deepEqual(calls, [
    ['pnpm', ['test-all'], '/workspace'],
    ['pnpm', ['nx', 'run', '@aiao/source:migration-release-gate'], '/workspace'],
    ['pnpm', ['nx', 'run', '@aiao/source:audit-package-graph'], '/workspace']
  ]);
});

test('任一门禁失败都短路，后续门禁不会运行', () => {
  const calls = [];
  assert.throws(
    () =>
      runPreflight({
        snapshot: () => snapshot(),
        runCommand: (command, args) => {
          calls.push([command, args]);
          return { status: command === 'pnpm' && args[0] === 'test-all' ? 1 : 0 };
        }
      }),
    /全量校验失败/
  );
  assert.deepEqual(calls, [['pnpm', ['test-all']]]);
});

test('门禁进程无法启动也必须失败', () => {
  assert.throws(
    () =>
      runPreflight({
        snapshot: () => snapshot(),
        runCommand: () => ({ status: null, error: new Error('ENOEXEC') })
      }),
    /无法启动/
  );
});

test('校验完成后输入变化会阻止继续发布', () => {
  const snapshots = [snapshot(), snapshot({ head: 'new-head' })];
  const calls = [];
  assert.throws(
    () =>
      runPreflight({
        snapshot: () => snapshots.shift(),
        runCommand: (command, args) => {
          calls.push([command, args]);
          return { status: 0 };
        }
      }),
    /提交/
  );
  assert.equal(calls.length, 3);
});

test('根发布入口经过共享 preflight，publish-local 保持原入口', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(scripts.publish, /release-preflight\.mjs/);
  assert.match(scripts.publish, /pnpm exec nx release publish/);
  assert.doesNotMatch(scripts['publish-local'], /release-preflight\.mjs/);
});
