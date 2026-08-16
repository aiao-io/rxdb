import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  // baseHref 与 outputPath 必须成对出现：只改 baseHref 会把 /demo/angular/ 写进
  // e2e 的 webServer 根，localhost:8200 上整套 e2e 全红。
  assert.match(step.command, /--base-href=\/demo\/angular\//);
  assert.match(step.command, /--output-path=dist\/apps\/dev-rxdb-angular-website(?:["'\s]|$)/);

  const source = String(step.postBuild);
  assert.match(source, /dev-rxdb-angular-website\/browser/);
  assert.doesNotMatch(source, /dev-rxdb-angular\/browser/);
});

test('every --configuration referenced by a step exists in the target project.json', () => {
  // Nx 的 resolveConfiguration 对不存在的 configuration **静默**回退到 defaultConfiguration，
  // 构建照样报成功、产物却少了这份 configuration 的所有选项。逗号串联（`production,website`）
  // 正是这样一个不存在的 key。这里把「配置名必须真实存在」变成断言，而不是留给部署去发现。
  const nxBuild = /pnpm nx (?<target>[\w-]+) (?<project>[\w-]+)[^\n]*--configuration=(?<configuration>[^\s'"]+)/g;

  for (const step of steps) {
    for (const { groups } of step.command.matchAll(nxBuild)) {
      const { target, project, configuration } = groups;
      const projectJson = join(repoRoot, 'apps', project, 'project.json');

      assert.ok(existsSync(projectJson), `${project} has no apps/${project}/project.json`);
      const configurations = JSON.parse(readFileSync(projectJson, 'utf8')).targets?.[target]?.configurations ?? {};

      assert.ok(
        Object.hasOwn(configurations, configuration),
        `${project}:${target} has no configuration "${configuration}" — nx would silently fall back to the default`
      );
    }
  }
});
