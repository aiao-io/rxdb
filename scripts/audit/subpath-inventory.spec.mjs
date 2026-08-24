import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditAssetWhitelistScope, listSubpathExports, resolveScanEntries } from './subpath-inventory.mjs';

const packagesDir = fileURLToPath(new URL('./__fixtures__/subpath-inventory/packages/', import.meta.url));
const fixture = name => join(packagesDir, name);
const subpathsOf = result => result.entries.map(entry => entry.subpath);

test('没有 exports 字段的包只扫主入口', () => {
  const { entries, skippedAssets, problems } = resolveScanEntries(fixture('no-exports'));

  assert.deepEqual(problems, []);
  assert.deepEqual(skippedAssets, []);
  assert.deepEqual(entries, [{ subpath: '.', sourceFile: join(fixture('no-exports'), 'src', 'index.ts') }]);
});

test('主入口固定取 src/index.ts，不读 exports 的 `.` 条件', () => {
  const { entries } = resolveScanEntries(fixture('main-only'));

  assert.deepEqual(subpathsOf({ entries }), ['.']);
  assert.equal(entries[0].sourceFile, join(fixture('main-only'), 'src', 'index.ts'));
});

test('声明了 `@aiao/source` 的子路径入口全部纳入扫描', () => {
  const { entries, problems } = resolveScanEntries(fixture('with-source'));

  assert.deepEqual(problems, []);
  assert.deepEqual(subpathsOf({ entries }), ['.', './client', './testing']);
  assert.equal(entries[1].sourceFile, join(fixture('with-source'), 'src', 'client.ts'));
  assert.equal(entries[2].sourceFile, join(fixture('with-source'), 'src', 'testing.ts'));
});

test('登记在资产白名单的子路径被跳过，同包其余入口照扫', () => {
  const { entries, skippedAssets, problems } = resolveScanEntries(fixture('asset-entry'), ['./assets/thing.wasm']);

  assert.deepEqual(problems, []);
  assert.deepEqual(skippedAssets, ['./assets/thing.wasm']);
  assert.deepEqual(subpathsOf({ entries }), ['.', './runtime']);
});

test('资产入口未登记白名单时失败——字符串目标没有 `@aiao/source` 可读', () => {
  const { problems } = resolveScanEntries(fixture('asset-entry'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.\/assets\/thing\.wasm/);
  assert.match(problems[0], /@aiao\/source/);
});

test('子路径缺少 `@aiao/source` 时失败，且不落进 entries（否则会被记成零导出）', () => {
  const { entries, problems } = resolveScanEntries(fixture('with-subpaths'));

  assert.deepEqual(subpathsOf({ entries }), ['.']);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /\.\/client/);
  assert.match(problems[1], /\.\/testing/);
});

test('`@aiao/source` 指向的文件不存在时硬失败，不降级为零导出', () => {
  const { entries, problems } = resolveScanEntries(fixture('broken-source'));

  assert.deepEqual(subpathsOf({ entries }), ['.']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.\/gone/);
  assert.match(problems[0], /src\/gone\.ts/);
  assert.match(problems[0], /不存在/);
});

test('白名单登记了包里已不存在的资产入口时报错', () => {
  const { problems } = resolveScanEntries(fixture('asset-entry'), ['./assets/thing.wasm', './assets/gone.wasm']);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.\/assets\/gone\.wasm/);
  assert.match(problems[0], /已不存在/);
});

test('package.json 缺失时抛错，不静默跳过整个包', () => {
  assert.throws(() => resolveScanEntries(fixture('does-not-exist')), /package\.json/);
});

test('资产白名单里的包已不在扫描范围时报错', () => {
  const problems = auditAssetWhitelistScope(['main-only'], new Map([['removed-package', ['./assets/x.wasm']]]));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /removed-package/);
  assert.match(problems[0], /扫描范围/);
});

test('资产白名单里的包仍在扫描范围时通过', () => {
  const problems = auditAssetWhitelistScope(['asset-entry'], new Map([['asset-entry', ['./assets/thing.wasm']]]));

  assert.deepEqual(problems, []);
});

test('exports 简写成字符串时没有子路径（不能把字符串下标当 key）', () => {
  assert.deepEqual(listSubpathExports({ exports: './dist/index.js' }), []);
});

test('exports 是 fallback 数组时没有子路径', () => {
  assert.deepEqual(listSubpathExports({ exports: ['./dist/index.js', './dist/index.cjs'] }), []);
});

test('exports 只有条件简写时没有子路径（import/require 不是子路径）', () => {
  assert.deepEqual(listSubpathExports({ exports: { import: './dist/index.js', require: './dist/index.cjs' } }), []);
});

test('子路径与条件混排时只取以 ./ 开头的 key', () => {
  const exports = {
    '.': { import: './dist/index.js' },
    './package.json': './package.json',
    './testing': { import: './dist/testing.js' },
    './client': './dist/client.js'
  };

  assert.deepEqual(listSubpathExports({ exports }), ['./client', './testing']);
});
