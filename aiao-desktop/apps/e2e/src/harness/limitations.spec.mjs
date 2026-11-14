import assert from 'node:assert/strict';
import test from 'node:test';

import { judgeRun, loadLimitations, selectLimitations, validateLimitations } from './limitations.mjs';

const outcome = (group, overrides = {}) => ({
  group,
  failedKeys: [],
  missingKeys: [],
  extraKeys: [],
  crashed: null,
  pageErrors: [],
  ...overrides
});
const check = (key, tier = '有限支持') => ({ kind: 'check', key, tier, reason: '引擎不支持' });

test('全部通过、没有限制清单：没有任何问题', () => {
  assert.deepEqual(judgeRun([outcome('shell')], []), { unexpected: [], stale: [], known: [] });
});

test('没登记的失败、缺项、异常和页面错误都是意外', () => {
  const result = judgeRun(
    [outcome('a', { failedKeys: ['a.x'], missingKeys: ['a.y'], crashed: '超时', pageErrors: ['boom'] })],
    []
  );
  assert.equal(result.unexpected.length, 4);
  assert.deepEqual(result.stale, []);
});

test('多出未声明的检查项任何情况下都是意外，登记整个检查组也不豁免', () => {
  const group = { kind: 'group', group: 'a', tier: '有限支持', reason: 'x' };
  assert.equal(judgeRun([outcome('a', { extraKeys: ['a.z'] })], [group]).unexpected.length, 1);
});

test('登记过的检查项失败是已知的，不算失败', () => {
  const limitation = check('a.x');
  const result = judgeRun([outcome('a', { failedKeys: ['a.x'] })], [limitation]);
  assert.deepEqual(result, { unexpected: [], stale: [], known: [limitation] });
});

test('登记了却通过的检查项是过期限制，算失败', () => {
  const result = judgeRun([outcome('a')], [check('a.x')]);
  assert.equal(result.unexpected.length, 0);
  assert.equal(result.stale.length, 1);
  assert.match(result.stale[0], /限制已经过期.*a\.x/);
});

test('整个检查组登记为限制：它的异常、缺项与页面错误都是已知的；检查组没问题了就过期', () => {
  const group = { kind: 'group', group: 'integrated-app', tier: '有限支持', reason: '离线失败要等 60 秒' };
  const failing = outcome('integrated-app', { missingKeys: ['k'], crashed: '超时', pageErrors: ['x'] });
  assert.deepEqual(judgeRun([failing], [group]), { unexpected: [], stale: [], known: [group] });
  assert.equal(judgeRun([outcome('integrated-app')], [group]).stale.length, 1);
});

test('登记的页面错误按正则匹配，别的页面错误仍然是意外', () => {
  const limitation = { kind: 'pageError', group: 'a', pattern: 'blob:', tier: '有限支持', reason: 'COEP' };
  const result = judgeRun(
    [outcome('a', { pageErrors: ['Fetch API cannot load blob:http://x', '别的错误'] })],
    [limitation]
  );
  assert.deepEqual(result.known, [limitation]);
  assert.deepEqual(result.unexpected, ['[a] 页面错误：别的错误']);
});

test('检查组异常导致缺项，缺的键都登记过时不再重复报异常', () => {
  const result = judgeRun([outcome('a', { missingKeys: ['a.x'], crashed: '超时' })], [check('a.x')]);
  assert.deepEqual(result.unexpected, []);
});

test('清单校验：引擎要对得上、档位与原因必填、不重复', () => {
  assert.throws(() => validateLimitations({ engine: 'firefox', limitations: [] }, 'webkit'), /期望 webkit/);
  assert.throws(
    () =>
      validateLimitations(
        { engine: 'webkit', limitations: [{ kind: 'check', key: 'a', tier: '完整支持', reason: 'x' }] },
        'webkit'
      ),
    /档位/
  );
  assert.throws(
    () =>
      validateLimitations(
        { engine: 'webkit', limitations: [{ kind: 'check', key: 'a', tier: '有限支持', reason: ' ' }] },
        'webkit'
      ),
    /缺少原因/
  );
  assert.throws(
    () => validateLimitations({ engine: 'webkit', limitations: [check('a'), check('a')] }, 'webkit'),
    /重复登记/
  );
  assert.doesNotThrow(() =>
    validateLimitations({ engine: 'webkit', limitations: [check('a'), check('b', '不支持')] }, 'webkit')
  );
});

test('默认从入口旁的 baseline 目录读取限制清单，不依赖执行目录', () => {
  assert.deepEqual(loadLimitations('chromium'), []);
  assert.ok(loadLimitations('firefox').some(item => item.key === 'integratedApp.keyboardReachesApp'));
});

test('定向运行只检查选中组的限制，未运行的组不算过期', () => {
  const limitations = [
    check('a.first'),
    check('b.second'),
    { kind: 'group', group: 'b', tier: '有限支持', reason: 'x' },
    { kind: 'pageError', group: 'a', pattern: 'error', tier: '有限支持', reason: 'x' }
  ];
  assert.deepEqual(selectLimitations(limitations, [{ name: 'a', keys: ['a.first'] }]), [
    limitations[0],
    limitations[3]
  ]);
});
