import assert from 'node:assert/strict';
import test from 'node:test';

import { checkPasses, compareKeys, failedChecks, flattenKeys, valueAt } from './keys.mjs';

test('对象逐层展开成点分路径，数组与基本值是叶子', () => {
  const result = { shell: { stage: true, dock: false }, finderNavigates: true, unopened: [] };
  assert.deepEqual(flattenKeys(result), ['shell.stage', 'shell.dock', 'finderNavigates', 'unopened']);
  assert.equal(valueAt(result, 'shell.dock'), false);
  assert.equal(valueAt(result, 'unopened'), result.unopened);
});

test('数组检查项必须为空才算通过，其余按真值', () => {
  assert.equal(checkPasses([]), true);
  assert.equal(checkPasses(['books']), false);
  assert.equal(checkPasses(true), true);
  assert.equal(checkPasses(false), false);
  assert.equal(checkPasses(undefined), false);
});

test('列出没通过的检查项', () => {
  const result = { shell: { stage: true, dock: false }, everyAppOpens: false, unopened: ['calculator'] };
  assert.deepEqual(failedChecks(result), ['shell.dock', 'everyAppOpens', 'unopened']);
});

test('比较声明的键与实际输出的键', () => {
  assert.deepEqual(compareKeys(['a', 'b.c'], ['a', 'b.d']), { missing: ['b.c'], extra: ['b.d'] });
  assert.deepEqual(compareKeys(['a'], ['a']), { missing: [], extra: [] });
});
