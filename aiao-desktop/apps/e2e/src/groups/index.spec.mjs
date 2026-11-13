import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GROUPS } from './index.mjs';

const baseline = JSON.parse(
  readFileSync(new URL('../baseline/smoke-keys-85b86fb3.json', import.meta.url), 'utf8')
).keys;
const defaults = GROUPS.filter(group => group.default !== false);

test('检查组名唯一', () => {
  const names = GROUPS.map(group => group.name);
  assert.equal(new Set(names).size, names.length);
});

test('每个检查组都声明了检查项键，且同一个键只由一个检查组产出', () => {
  const seen = new Map();
  for (const group of GROUPS) {
    assert.ok(group.keys.length > 0, `${group.name} 没有声明检查项`);
    assert.equal(typeof group.run, 'function', `${group.name} 缺少 run`);
    for (const key of group.keys) {
      assert.equal(seen.get(key), undefined, `${key} 同时由 ${seen.get(key)} 与 ${group.name} 声明`);
      seen.set(key, group.name);
    }
  }
});

test('默认检查组产出拆分前单体冒烟的全部检查项（ADESK-US-008 AC#1）', () => {
  const declared = new Set(defaults.flatMap(group => group.keys));
  assert.deepEqual(
    baseline.filter(key => !declared.has(key)),
    []
  );
});

test('夹具自检不随全量冒烟运行，也不占用拆分前的检查项键', () => {
  const fixtures = GROUPS.find(group => group.name === 'fixtures');
  assert.equal(fixtures?.default, false);
  for (const key of fixtures.keys) assert.equal(baseline.includes(key), false, `${key} 不应出现在拆分前的基线里`);
});
