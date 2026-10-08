import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LANE_COUNT,
  MEMORY_TARGET,
  NO_COVERAGE_PROJECTS,
  SUPABASE_PROJECTS,
  planTestLanes
} from './plan-test-lanes.mjs';

const cliPath = fileURLToPath(new URL('./plan-test-lanes.mjs', import.meta.url));

/** 直接跑 CLI：`--lanes` 的校验发生在 `main()` 里，只测导出的纯函数覆盖不到。 */
const runCli = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });

/** 测试用权重表：故意与真实 WEIGHTS 解耦，避免真实测量值变动时用例跟着抖。 */
const weights = { heavy: 400, mid: 100, light: 10, 'rxdb-adapter-supabase': 30 };

const plan = (projects, options = {}) =>
  planTestLanes({
    projects,
    laneCount: 2,
    weights,
    warn: () => {
      //
    },
    ...options
  });

const allProjects = result => result.include.flatMap(lane => lane.projects.split(','));

test('空输入产出空矩阵', () => {
  assert.deepEqual(plan([]), { include: [] });
});

test('每个项目恰好出现一次，不丢不重', () => {
  const projects = ['heavy', 'mid', 'light', 'a', 'b', 'c', 'd'];
  const scheduled = allProjects(plan(projects));

  assert.equal(scheduled.length, projects.length);
  assert.deepEqual([...scheduled].sort(), [...projects].sort());
});

test('需要 Supabase 的项目被钉进独立 lane 并打上标记', () => {
  const result = plan(['rxdb-adapter-supabase', 'heavy', 'light']);
  const supabaseLanes = result.include.filter(lane => lane.supabase);

  assert.equal(supabaseLanes.length, 1);
  assert.deepEqual(supabaseLanes[0].projects.split(','), ['rxdb-adapter-supabase']);
  assert.ok(result.include.filter(lane => !lane.supabase).every(lane => !lane.projects.includes('supabase')));
});

test('没有 Supabase 项目时不产出 Supabase lane —— 不白起 Docker', () => {
  assert.ok(plan(['heavy', 'light']).include.every(lane => !lane.supabase));
});

test('重任务被拆散到不同 lane，而不是堆在一起', () => {
  const result = plan(['heavy', 'heavy2', 'light'], { weights: { heavy: 400, heavy2: 400, light: 10 } });
  const laneOf = name => result.include.findIndex(lane => lane.projects.split(',').includes(name));

  assert.notEqual(laneOf('heavy'), laneOf('heavy2'));
});

test('lane 数不超过上限；项目不够时不产出空 lane', () => {
  const result = plan(['light'], { laneCount: 4 });

  assert.equal(result.include.length, 1);
  assert.ok(result.include.every(lane => lane.projects.length > 0));
});

test('同样的输入产出同样的结果 —— matrix 必须可复现', () => {
  const projects = ['heavy', 'mid', 'light', 'a', 'b'];

  assert.deepEqual(plan(projects), plan(projects));
});

test('输入顺序不影响分桶结果', () => {
  const projects = ['heavy', 'mid', 'light', 'a', 'b'];

  assert.deepEqual(plan(projects), plan([...projects].reverse()));
});

test('lane 名唯一，可直接当 job 名用', () => {
  const lanes = plan(['rxdb-adapter-supabase', 'heavy', 'mid', 'light']).include.map(lane => lane.lane);

  assert.equal(new Set(lanes).size, lanes.length);
});

test('label 报出最重的项目 +「还有几个」—— checks 列表里要看得出这条 lane 在跑什么', () => {
  const result = plan(['heavy', 'mid', 'light'], { laneCount: 1 });

  assert.deepEqual(
    result.include.map(lane => lane.label),
    ['heavy +2']
  );
});

test('lane 只有一个项目时 label 不带 +N', () => {
  assert.deepEqual(
    plan(['light'], { laneCount: 4 }).include.map(lane => lane.label),
    ['light']
  );
});

test('Supabase lane 的 label 是 supabase —— 要能一眼看出是那条起 Docker 的', () => {
  const result = plan(['rxdb-adapter-supabase', 'heavy', 'light']);
  const supabaseLane = result.include.find(lane => lane.supabase);

  assert.equal(supabaseLane.label, 'supabase');
});

test('label 唯一：每条 lane 的最重项目互不相同', () => {
  const labels = plan(['rxdb-adapter-supabase', 'heavy', 'mid', 'light', 'a', 'b']).include.map(lane => lane.label);

  assert.equal(new Set(labels).size, labels.length);
});

test('权重表里没有的项目照常调度，但必须报出来 —— 不能让新包静默失衡', () => {
  const unweighted = [];
  const result = plan(['heavy', 'brand-new-package'], { warn: names => unweighted.push(...names) });

  assert.ok(allProjects(result).includes('brand-new-package'));
  assert.deepEqual(unweighted, ['brand-new-package']);
});

test('整条 lane 都不采集覆盖率时标 coverage: false —— 上传步骤据此跳过，而不是找不到文件就红', () => {
  // PR #89：只改了 website 的文档，affected 集合里 website 单独成 lane，`node --test` 不产覆盖率，
  // 上传步骤的 if-no-files-found: error 必红，连带 coverage job 判「上游未全绿」。
  const result = plan(['website'], { noCoverageProjects: ['website'] });

  assert.deepEqual(
    result.include.map(lane => [lane.projects, lane.coverage]),
    [['website', false]]
  );
});

test('lane 里只要混进一个采集覆盖率的项目就标 coverage: true —— 仍按 error 严格要求产物', () => {
  const result = plan(['website', 'light'], { laneCount: 1, noCoverageProjects: ['website'] });

  assert.deepEqual(
    result.include.map(lane => [lane.projects, lane.coverage]),
    [['light,website', true]]
  );
});

test('Supabase lane 照常标 coverage: true', () => {
  const result = plan(['rxdb-adapter-supabase'], { noCoverageProjects: ['website'] });

  assert.equal(result.include[0].coverage, true);
});

test('真实常量：不采集覆盖率的项目只有 website', () => {
  assert.deepEqual(NO_COVERAGE_PROJECTS, ['website']);
});

test('真实常量自洽：Supabase 项目非空、lane 数为正', () => {
  assert.ok(SUPABASE_PROJECTS.length > 0);
  assert.ok(LANE_COUNT > 0);
});

test('每条 lane 都带 target：常规 lane 与 Supabase lane 跑 test', () => {
  const result = plan(['rxdb-adapter-supabase', 'heavy', 'light']);

  assert.ok(result.include.length > 0);
  assert.ok(result.include.every(lane => lane.target === 'test'));
});

test('内存用例单独成一条 lane：跑 test-memory、不采集覆盖率、不占常规装箱', () => {
  // 按子进程 RSS 判「不随库线性增长」的用例要独占机器、串行跑；和别的项目同 lane 时它排在最后，
  // 整条 lane 被它拖成长尾（PR #101：rxdb-adapter-electron 的两份内存用例串行 469s）。
  // v8 覆盖率插桩本身也会抬高 RSS，测量 lane 不该带它。
  const result = plan(['heavy', 'light'], { memoryProjects: ['heavy'] });
  const memoryLanes = result.include.filter(lane => lane.target === MEMORY_TARGET);

  assert.deepEqual(
    memoryLanes.map(lane => [lane.lane, lane.projects, lane.coverage, lane.supabase]),
    [['memory', 'heavy', false, false]]
  );
  assert.equal(memoryLanes[0].label, `heavy (${MEMORY_TARGET})`);
  // 常规 test lane 照旧有 heavy：两个 target 各管一半用例
  assert.deepEqual(allProjects({ include: result.include.filter(lane => lane.target === 'test') }).sort(), [
    'heavy',
    'light'
  ]);
});

test('没有内存用例项目时不产出内存 lane', () => {
  assert.ok(plan(['heavy', 'light'], { memoryProjects: [] }).include.every(lane => lane.target === 'test'));
});

test('内存用例项目不在本次 test 集里时不产出内存 lane —— affected 没算到就不跑', () => {
  assert.ok(plan(['light'], { memoryProjects: ['heavy'] }).include.every(lane => lane.target === 'test'));
});

test('CLI：--memory-projects 产出内存 lane', () => {
  const result = runCli('--projects=a,b', '--memory-projects=a');

  assert.equal(result.status, 0);
  assert.deepEqual(
    JSON.parse(result.stdout)
      .include.filter(lane => lane.target === MEMORY_TARGET)
      .map(lane => lane.projects),
    ['a']
  );
});

test('CLI：--lanes 非正整数直接失败，不产出空 matrix', () => {
  for (const bad of ['abc', '0', '-1', '2.5', '']) {
    const result = runCli('--projects=rxdb', `--lanes=${bad}`);

    assert.equal(result.status, 1, `--lanes=${bad} 应该以 1 退出`);
    assert.equal(result.stdout, '', `--lanes=${bad} 不应该产出 matrix`);
    assert.match(result.stderr, /--lanes 必须是正整数/);
  }
});

test('CLI：--lanes 合法时按给定数量分桶', () => {
  const result = runCli('--projects=a,b,c,d', '--lanes=2');

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).include.length, 2);
});

test('CLI：缺 --projects 时给出用法并失败', () => {
  const result = runCli();

  assert.equal(result.status, 1);
  assert.match(result.stderr, /用法/);
});
