import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { getPackageNames, repoRoot, steps } from './build-website.mjs';

test('importing the module does not run the build', () => {
  // 能执行到这一行本身就是断言：没有主入口守卫时，import 会同步跑完整个 run-many，
  // 后面的用例根本轮不到。
  assert.ok(Array.isArray(steps));
  assert.ok(steps.length > 0);
});

test('repoRoot points at the workspace root regardless of process.cwd()', () => {
  // 本测试由 `nx test website` 以 cwd=website 启动，正是会踩到 process.cwd() 的场景。
  assert.ok(existsSync(join(repoRoot, 'nx.json')));
  assert.ok(existsSync(join(repoRoot, 'packages')));
});

test('getPackageNames returns sorted nx projects under packages/', () => {
  const names = getPackageNames();

  assert.ok(names.length > 0);
  assert.deepEqual(names, [...names].sort());
  assert.ok(names.includes('rxdb'));
  for (const name of names) {
    assert.ok(existsSync(join(repoRoot, 'packages', name, 'project.json')), `${name} is not an nx project`);
  }
});

test('builds workspace packages before demo applications', () => {
  const packagesIndex = steps.findIndex(step => step.name === '构建核心库');

  assert.notEqual(packagesIndex, -1);
  for (const demo of ['React', 'Vue', 'Angular']) {
    const demoIndex = steps.findIndex(step => step.name === `构建 ${demo} 演示`);

    assert.notEqual(demoIndex, -1);
    assert.ok(packagesIndex < demoIndex, `workspace packages must be built before the ${demo} demo`);
  }
});

test('every step carries a name and a command', () => {
  for (const step of steps) {
    assert.equal(typeof step.name, 'string');
    assert.ok(step.name.length > 0);
    assert.equal(typeof step.command, 'string');
    assert.ok(step.command.length > 0);
  }
});

test('Angular demo build writes to a dedicated output path, not the e2e dist', () => {
  const step = steps.find(item => item.name === '构建 Angular 演示');

  assert.ok(step, 'missing Angular demo step');
  assert.match(step.command, /--configuration=production,website/);
  assert.doesNotMatch(step.command, /--base-href=/);
  assert.doesNotMatch(step.command, /dist\/apps\/dev-rxdb-angular(?:["'\s]|$)/);

  const source = String(step.postBuild);
  assert.match(source, /dev-rxdb-angular-website\/browser/);
  assert.doesNotMatch(source, /dev-rxdb-angular\/browser/);
});
