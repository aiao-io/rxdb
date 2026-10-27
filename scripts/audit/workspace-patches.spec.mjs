import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { scanPackages } from './lib/package-discovery.mjs';
import {
  findPublishedPatchConflicts,
  parseOverriddenPackages,
  parsePatchedDependencies
} from './workspace-patches.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

const record = (name, manifest) => ({ name, manifest: { name, ...manifest } });

test('解析 patchedDependencies：带引号的 scoped 键、裸键与只写包名的键', () => {
  const yaml = [
    'catalog:',
    '  vue: ^3.5.43',
    'patchedDependencies:',
    "  '@subframe7536/sqlite-wasm@1.4.0': patches/@subframe7536__sqlite-wasm@1.4.0.patch",
    '',
    '  typescript@6.0.3: patches/typescript@6.0.3.patch',
    '  left-pad: patches/left-pad.patch',
    'peerDependencyRules:',
    '  allowedVersions: {}'
  ].join('\n');

  assert.deepEqual(parsePatchedDependencies(yaml), [
    {
      key: '@subframe7536/sqlite-wasm@1.4.0',
      name: '@subframe7536/sqlite-wasm',
      version: '1.4.0',
      patch: 'patches/@subframe7536__sqlite-wasm@1.4.0.patch'
    },
    { key: 'typescript@6.0.3', name: 'typescript', version: '6.0.3', patch: 'patches/typescript@6.0.3.patch' },
    { key: 'left-pad', name: 'left-pad', version: null, patch: 'patches/left-pad.patch' }
  ]);
});

test('没有 patchedDependencies 段时为空', () => {
  assert.deepEqual(parsePatchedDependencies('packages:\n  - packages/*\n'), []);
});

test('YAML 注释不影响解析：段头行尾注释、段内注释行、条目行尾注释', () => {
  const yaml = [
    'patchedDependencies: # 只给构建工具打补丁',
    '  # 编译器崩溃的回退',
    '  typescript@6.0.3: patches/typescript@6.0.3.patch # 上游未修',
    '# 顶格注释也属于注释',
    "  '@tarojs/vite-runner@4.3.1': patches/@tarojs__vite-runner@4.3.1.patch",
    'overrides:',
    '  qs: ^6.16.0'
  ].join('\n');

  assert.deepEqual(
    parsePatchedDependencies(yaml).map(entry => entry.key),
    ['typescript@6.0.3', '@tarojs/vite-runner@4.3.1']
  );
});

test('解析 overrides 改写的包名：版本选择器与父包选择器都取最终被改写的那个包', () => {
  const yaml = [
    'overrides:',
    "  '@babel/core@7': ^7.29.7",
    '  axios@1: ^1.20.0',
    "  '@tarojs/vite-runner>vite': 6.4.4",
    '  miniprogram-automator>debug: ^4.4.3 # 安全修复',
    'patchedDependencies:',
    '  typescript@6.0.3: patches/typescript@6.0.3.patch'
  ].join('\n');

  assert.deepEqual([...parseOverriddenPackages(yaml)].sort(), ['@babel/core', 'axios', 'debug', 'vite']);
});

// 1.4.0 事故：补丁让工作区里的 iOS 兼容测试全绿，npm 用户装到的却是没打补丁的原包。
test('可发布包在运行时依赖被打补丁的同版本包即报出', () => {
  const patches = [{ key: 'foo@1.4.0', name: 'foo', version: '1.4.0', patch: 'patches/foo@1.4.0.patch' }];
  const conflicts = findPublishedPatchConflicts(patches, [
    record('@aiao/a', { dependencies: { foo: '1.4.0' } }),
    record('@aiao/b', { peerDependencies: { foo: '1.4.0' } }),
    record('@aiao/c', { optionalDependencies: { foo: '1.4.0' } })
  ]);

  assert.deepEqual(conflicts, [
    '@aiao/a dependencies foo@1.4.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)',
    '@aiao/b peerDependencies foo@1.4.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)',
    '@aiao/c optionalDependencies foo@1.4.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)'
  ]);
});

test('精确钉在别的版本上的依赖不受这份补丁影响', () => {
  const patches = [{ key: 'foo@1.4.0', name: 'foo', version: '1.4.0', patch: 'patches/foo@1.4.0.patch' }];

  assert.deepEqual(findPublishedPatchConflicts(patches, [record('@aiao/a', { dependencies: { foo: '1.3.1' } })]), []);
});

// 范围会被消费方解析到哪个版本无从证明，按会命中处理（fail-closed）。
test('范围依赖与只写包名的补丁一律视为命中', () => {
  const conflicts = findPublishedPatchConflicts(
    [
      { key: 'foo@1.4.0', name: 'foo', version: '1.4.0', patch: 'patches/foo@1.4.0.patch' },
      { key: 'bar', name: 'bar', version: null, patch: 'patches/bar.patch' }
    ],
    [record('@aiao/a', { dependencies: { foo: '^1.3.0', bar: '2.0.0' } })]
  );

  assert.deepEqual(conflicts, [
    '@aiao/a dependencies foo@^1.3.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)',
    '@aiao/a dependencies bar@2.0.0 <- bar (patches/bar.patch)'
  ]);
});

test('npm 别名指向被打补丁的包同样命中', () => {
  const patches = [{ key: 'foo@1.4.0', name: 'foo', version: '1.4.0', patch: 'patches/foo@1.4.0.patch' }];
  const conflicts = findPublishedPatchConflicts(patches, [
    record('@aiao/a', { dependencies: { fooAlias: 'npm:foo@1.4.0', other: 'npm:foo@1.3.1' } })
  ]);

  assert.deepEqual(conflicts, ['@aiao/a dependencies fooAlias@npm:foo@1.4.0 <- foo@1.4.0 (patches/foo@1.4.0.patch)']);
});

// 精确钉在别的版本上也可能被 overrides 改写成被打补丁的版本：工作区测的是补丁版，消费方装的是清单里的版本。
test('被 overrides 改写的包，精确版本也不豁免', () => {
  const patches = [{ key: 'foo@1.4.0', name: 'foo', version: '1.4.0', patch: 'patches/foo@1.4.0.patch' }];
  const conflicts = findPublishedPatchConflicts(
    patches,
    [record('@aiao/a', { dependencies: { foo: '1.3.1' } })],
    new Set(['foo'])
  );

  assert.deepEqual(conflicts, ['@aiao/a dependencies foo@1.3.1 <- foo@1.4.0 (patches/foo@1.4.0.patch)']);
});

test('devDependencies 只影响本仓库的构建与测试，不算', () => {
  const patches = [{ key: 'typescript@6.0.3', name: 'typescript', version: '6.0.3', patch: 'patches/ts.patch' }];

  assert.deepEqual(
    findPublishedPatchConflicts(patches, [record('@aiao/a', { devDependencies: { typescript: '6.0.3' } })]),
    []
  );
});

test('仓库现状：工作区补丁不覆盖任何可发布包的运行时依赖（回归护栏）', () => {
  const workspaceYaml = readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const patches = parsePatchedDependencies(workspaceYaml);

  assert.ok(patches.length > 0, 'pnpm-workspace.yaml 里应能解析出 patchedDependencies');
  assert.ok(parseOverriddenPackages(workspaceYaml).size > 0, 'pnpm-workspace.yaml 里应能解析出 overrides');
  assert.deepEqual(
    findPublishedPatchConflicts(
      patches,
      scanPackages(path.join(ROOT, 'packages')),
      parseOverriddenPackages(workspaceYaml)
    ),
    []
  );
});
