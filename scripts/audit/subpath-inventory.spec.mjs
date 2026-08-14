import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditSubpathInventory } from './subpath-inventory.mjs';

const packagesDir = fileURLToPath(new URL('./__fixtures__/subpath-inventory/packages/', import.meta.url));

test('主入口与 package.json 自身不算子路径入口', () => {
  const problems = auditSubpathInventory(packagesDir, ['main-only'], new Map());

  assert.deepEqual(problems, []);
});

test('全部子路径都已登记时通过', () => {
  const known = new Map([['with-subpaths', ['./client', './testing']]]);

  assert.deepEqual(auditSubpathInventory(packagesDir, ['with-subpaths'], known), []);
});

test('登记顺序不影响判定', () => {
  const known = new Map([['with-subpaths', ['./testing', './client']]]);

  assert.deepEqual(auditSubpathInventory(packagesDir, ['with-subpaths'], known), []);
});

test('包新增了未登记的子路径时报错并列出路径', () => {
  const known = new Map([['with-subpaths', ['./client']]]);

  const problems = auditSubpathInventory(packagesDir, ['with-subpaths'], known);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /with-subpaths/);
  assert.match(problems[0], /未登记/);
  assert.match(problems[0], /\.\/testing/);
});

test('清单登记了包里已不存在的子路径时报错', () => {
  const known = new Map([['with-subpaths', ['./client', './testing', './gone']]]);

  const problems = auditSubpathInventory(packagesDir, ['with-subpaths'], known);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /\.\/gone/);
  assert.match(problems[0], /已不存在/);
});

test('清单里的包已不在扫描范围时报错', () => {
  const known = new Map([['removed-package', ['./testing']]]);

  const problems = auditSubpathInventory(packagesDir, ['main-only'], known);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /removed-package/);
  assert.match(problems[0], /扫描范围/);
});

test('完全没有 exports 字段的包不报错', () => {
  assert.deepEqual(auditSubpathInventory(packagesDir, ['no-exports'], new Map()), []);
});
