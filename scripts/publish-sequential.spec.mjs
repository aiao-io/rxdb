/**
 * scripts/publish-sequential.spec.mjs
 *
 * 覆盖发布脚本里可脱离网络/进程的纯函数：参数解析与依赖拓扑排序。
 * 真正的 `pnpm publish` 与 registry 查询在 `main` 里、不在单测范围内。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs, topologicalOrder } from './publish-sequential.mjs';

const record = (name, manifest = {}) => ({ name, manifest: { name, version: '0.0.28', ...manifest } });

test('parseArgs：默认 registry 与空选项', () => {
  assert.deepEqual(parseArgs([]), {
    registry: 'https://registry.npmjs.org',
    access: undefined,
    tag: undefined,
    otp: undefined,
    dryRun: false,
    help: false
  });
});

test('parseArgs：解析全部选项', () => {
  assert.deepEqual(
    parseArgs(['--dry-run', '--registry=http://localhost:4873', '--access=public', '--tag=next', '--otp=123456']),
    {
      registry: 'http://localhost:4873',
      access: 'public',
      tag: 'next',
      otp: '123456',
      dryRun: true,
      help: false
    }
  );
});

test('parseArgs：--help 与 -h 等价', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('parseArgs：未知参数抛错', () => {
  assert.throws(() => parseArgs(['--nope']), /未知参数：--nope/);
});

test('topologicalOrder：依赖先于依赖者', () => {
  const packages = [
    record('@aiao/rxdb', { dependencies: { '@aiao/utils': 'workspace:^' } }),
    record('@aiao/utils', {})
  ];
  const names = topologicalOrder(packages).map(pkg => pkg.name);
  assert.ok(names.indexOf('@aiao/utils') < names.indexOf('@aiao/rxdb'));
});

test('topologicalOrder：跨层依赖深度优先展开', () => {
  const packages = [
    record('@aiao/rxdb-angular', { peerDependencies: { '@aiao/rxdb': 'workspace:^' } }),
    record('@aiao/rxdb', { dependencies: { '@aiao/utils': 'workspace:^' } }),
    record('@aiao/utils', {})
  ];
  const names = topologicalOrder(packages).map(pkg => pkg.name);
  assert.deepEqual(names, ['@aiao/utils', '@aiao/rxdb', '@aiao/rxdb-angular']);
});

test('topologicalOrder：忽略本仓库外的 @aiao/* 依赖', () => {
  const packages = [
    record('@aiao/rxdb', { dependencies: { '@aiao/deprecated-pkg': '^0.0.1' } }),
    record('@aiao/utils', {})
  ];
  const names = topologicalOrder(packages).map(pkg => pkg.name);
  // @aiao/deprecated-pkg 不在集合里，不参与排序也不报错
  assert.deepEqual(new Set(names), new Set(['@aiao/utils', '@aiao/rxdb']));
});

test('topologicalOrder：确定性（同层按包名升序）', () => {
  const packages = [record('@aiao/bbb'), record('@aiao/aaa'), record('@aiao/ccc')];
  const names = topologicalOrder(packages).map(pkg => pkg.name);
  assert.deepEqual(names, ['@aiao/aaa', '@aiao/bbb', '@aiao/ccc']);
});
