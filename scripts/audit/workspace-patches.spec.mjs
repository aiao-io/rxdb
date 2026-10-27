import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { scanPackages } from './lib/package-discovery.mjs';
import { findPublishedPatchConflicts, parsePatchedDependencies } from './workspace-patches.mjs';

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

test('devDependencies 只影响本仓库的构建与测试，不算', () => {
  const patches = [{ key: 'typescript@6.0.3', name: 'typescript', version: '6.0.3', patch: 'patches/ts.patch' }];

  assert.deepEqual(
    findPublishedPatchConflicts(patches, [record('@aiao/a', { devDependencies: { typescript: '6.0.3' } })]),
    []
  );
});

test('仓库现状：工作区补丁不覆盖任何可发布包的运行时依赖（回归护栏）', () => {
  const patches = parsePatchedDependencies(readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8'));

  assert.ok(patches.length > 0, 'pnpm-workspace.yaml 里应能解析出 patchedDependencies');
  assert.deepEqual(findPublishedPatchConflicts(patches, scanPackages(path.join(ROOT, 'packages'))), []);
});
