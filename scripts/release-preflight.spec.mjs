import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  assertStableInputs,
  collectArtifactDigest,
  normalizeDryRunArgs,
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

test('dry-run 会给发布命令补上 dry-run 参数', () => {
  assert.deepEqual(normalizeDryRunArgs(['pnpm', 'exec', 'nx', 'release', 'publish']), [
    'pnpm',
    'exec',
    'nx',
    'release',
    'publish',
    '--dry-run'
  ]);
  assert.deepEqual(normalizeDryRunArgs(['publish', '--dry-run']), ['publish', '--dry-run']);
  assert.deepEqual(normalizeDryRunArgs(['node', 'scripts/publish-sequential.mjs']), [
    'node',
    'scripts/publish-sequential.mjs',
    '--dry-run'
  ]);
  assert.deepEqual(normalizeDryRunArgs(['echo', 'ok']), ['echo', 'ok']);
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
  let calls = 0;
  assert.throws(
    () =>
      runPreflight({
        snapshot: () => snapshot({ status: ' M package.json' }),
        runCommand: () => {
          calls++;
          return { status: 0 };
        }
      }),
    /工作区必须干净/
  );
  assert.equal(calls, 0);
});

test('发布校验期间提交、清单或版本变化都会失效', () => {
  for (const field of ['head', 'status', 'migrationManifestDigest', 'packageVersion', 'releaseProjectsDigest']) {
    assert.throws(
      () => assertStableInputs(snapshot(), snapshot({ [field]: `${field}-changed` })),
      new RegExp(
        field === 'head' ? '提交'
        : field === 'status' ? '工作区'
        : '发布校验期间发生变化'
      )
    );
  }
  assert.throws(
    () => assertStableInputs({ artifactDigest: 'before' }, { artifactDigest: 'after' }),
    /发布产物/
  );
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
    [
      'pnpm',
      [
        'nx',
        'run-many',
        '-t',
        'build',
        '--projects=packages/*',
        '--skipNxCache',
        '--output-style=static',
        '--parallel=4',
        '--nxBail'
      ],
      '/workspace'
    ],
    ['pnpm', ['test-packages'], '/workspace'],
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
          return { status: command === 'pnpm' && args[0] === 'nx' ? 1 : 0 };
        }
      }),
    /全量包构建失败/
  );
  assert.deepEqual(calls, [
    [
      'pnpm',
      [
        'nx',
        'run-many',
        '-t',
        'build',
        '--projects=packages/*',
        '--skipNxCache',
        '--output-style=static',
        '--parallel=4',
        '--nxBail'
      ]
    ]
  ]);
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
  assert.equal(calls.length, 4);
});

test('发布产物摘要会捕获被忽略的 dist 变化', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-preflight-'));
  try {
    mkdirSync(join(root, 'packages', 'demo', 'dist'), { recursive: true });
    writeFileSync(join(root, 'packages', 'demo', 'package.json'), '{"name":"@aiao/demo"}');
    writeFileSync(join(root, 'packages', 'demo', 'dist', 'index.js'), 'first');
    const before = collectArtifactDigest(root);
    writeFileSync(join(root, 'packages', 'demo', 'dist', 'index.js'), 'second');
    assert.notEqual(before, collectArtifactDigest(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('根发布入口经过共享 preflight，publish-local 保持原入口', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(scripts.publish, /release-preflight\.mjs/);
  assert.match(scripts.publish, /pnpm exec nx release publish/);
  assert.doesNotMatch(scripts['publish-local'], /release-preflight\.mjs/);
});
