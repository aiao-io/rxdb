import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArguments, selectGroups } from './cli.mjs';

const groups = [{ name: 'shell' }, { name: 'game' }, { name: 'fixtures', default: false }];

test('默认参数：全部默认检查组、chromium、并行 3', () => {
  const options = parseArguments([]);
  assert.deepEqual(options, {
    list: false,
    help: false,
    groups: null,
    engine: 'chromium',
    parallel: 3,
    dist: undefined,
    headed: false
  });
  assert.deepEqual(
    selectGroups(groups, options.groups).map(group => group.name),
    ['shell', 'game']
  );
});

test('--group 可以逗号分隔也可以重复给出，并能选中默认不跑的夹具自检', () => {
  assert.deepEqual(parseArguments(['--group=shell,game', '--group=fixtures']).groups, ['shell', 'game', 'fixtures']);
  assert.deepEqual(
    selectGroups(groups, ['fixtures']).map(group => group.name),
    ['fixtures']
  );
});

test('未知的检查组、引擎和非法的并行数直接报错', () => {
  assert.throws(() => selectGroups(groups, ['nope']), /未知的检查组：nope/);
  assert.throws(() => parseArguments(['--engine=ie']), /未知的浏览器引擎/);
  assert.throws(() => parseArguments(['--parallel=0']), /--parallel/);
  assert.throws(() => parseArguments(['--parallel=x']), /--parallel/);
  assert.throws(() => parseArguments(['--mystery']));
});

test('引擎、并行数与产物目录', () => {
  const options = parseArguments(['--engine=webkit', '--parallel=3', '--dist=/tmp/web', '--headed']);
  assert.equal(options.engine, 'webkit');
  assert.equal(options.parallel, 3);
  assert.equal(options.dist, '/tmp/web');
  assert.equal(options.headed, true);
});
