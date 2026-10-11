import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  auditPackageGraph,
  buildKnowledge,
  checkGenerated,
  discoverRelease,
  renderKnowledge,
  scanPackages
} from './package-graph.mjs';

const fixture = new URL('./__fixtures__/package-graph/pass/', import.meta.url);
const facts = JSON.parse(await readFile(new URL('facts.json', fixture), 'utf8'));
const copy = () => structuredClone(facts);
const records = scanPackages(new URL('packages/', fixture));
const release = { tag: 'v1.2.3', version: '1.2.3', packages: records.filter(p => p.name !== '@aiao/rxdb-plugin-tree') };
const input = {
  compilerDependencies: { typescript: '~6.0.3', '@types/node': '^26.0.0', '@types/emscripten': '^1.41.6' },
  template: await readFile(new URL('template.md', fixture), 'utf8'),
  sample: await readFile(new URL('sample.ts', fixture), 'utf8'),
  compilerOptions: { strict: true },
  install: ['@aiao/rxdb', '@aiao/rxdb-adapter-pglite']
};

test('扫描不依赖 src/index.ts，tool 和双槽位组合均合法', () => {
  assert.ok(records.some(p => p.name === '@aiao/rxdb-test'));
  assert.ok(!records.some(p => p.name === '@aiao/private'));
  assert.ok(!records.some(p => p.directory.endsWith('directory-only')));
  assert.deepEqual(auditPackageGraph(copy(), records), []);
});

test('QueryCache 从源码 inject 闭合 history，而本地不带插件', () => {
  const knowledge = buildKnowledge(copy(), records, release, input);
  const qc = knowledge.development.scenarios.find(s => s.id === 'http-querycache');
  assert.deepEqual(
    qc.plugins.map(p => p.factory),
    ['rxDBPluginHistory', 'rxDBPluginQueryCache', 'rxDBPluginSync']
  );
  assert.ok(qc.packages.includes('@aiao/rxdb-plugin-history'));
  assert.deepEqual(knowledge.development.scenarios.find(s => s.id === 'local').plugins, []);
  assert.deepEqual(knowledge.development.scenarios.find(s => s.id === 'code-editor').slots, {});
  assert.deepEqual(knowledge.development.scenarios.find(s => s.id === 'code-editor').packages, ['@aiao/code-editor']);
});

for (const [name, mutate, expected] of [
  ['漏登记', f => (f.packages = f.packages.filter(pkg => pkg.name !== '@aiao/rxdb-test')), '@aiao/rxdb-test'],
  ['资源包漏登记', f => (f.packages = f.packages.filter(pkg => pkg.name !== '@aiao/code-editor')), '@aiao/code-editor'],
  ['删包残留', f => f.packages.push({ ...f.packages[0], name: '@aiao/removed' }), '@aiao/removed'],
  ['重复', f => f.packages.push(f.packages[0]), '重复'],
  ['缺字段', f => delete f.packages[0].hosts, 'hosts'],
  ['非法角色', f => (f.packages[0].role = 'mystery'), 'role'],
  ['共享实现占槽位', f => f.packages.find(p => p.role === 'shared-impl').slots.push('local'), 'slots'],
  ['情景悬空', f => f.scenarios[0].packages.push('@aiao/unknown'), '@aiao/unknown'],
  ['插件悬空', f => f.scenarios[0].plugins.push('@aiao/unknown'), '@aiao/unknown'],
  ['同槽双后端', f => f.scenarios[0].packages.push('@aiao/rxdb-adapter-sqlite-core'), ''],
  ['槽位错配', f => (f.scenarios[0].slots.local = '@aiao/rxdb-adapter-http'), 'local']
]) {
  test(name, () => {
    const changed = copy();
    mutate(changed);
    if (!expected) {
      changed.packages.find(p => p.name === '@aiao/rxdb-adapter-sqlite-core').role = 'backend';
      changed.packages.find(p => p.name === '@aiao/rxdb-adapter-sqlite-core').slots = ['local'];
    }
    const errors = auditPackageGraph(changed, records);
    assert.ok(errors.length, JSON.stringify(errors));
    if (expected)
      assert.ok(
        errors.some(error => error.includes(expected)),
        errors.join('\n')
      );
  });
}

test('SQLite 双槽位与加密能力合法，实现依赖和 optional peer 不占第二个槽位', () => {
  const knowledge = buildKnowledge(copy(), records, release, input);
  const scenarios = new Map(knowledge.development.scenarios.map(scenario => [scenario.id, scenario]));
  assert.deepEqual(scenarios.get('wa-sqlite-supabase').slots, {
    local: '@aiao/rxdb-adapter-wa-sqlite',
    remote: '@aiao/rxdb-adapter-supabase'
  });
  assert.deepEqual(scenarios.get('sqlite-http-querycache').packages, [
    '@aiao/rxdb',
    '@aiao/rxdb-adapter-http',
    '@aiao/rxdb-adapter-wa-sqlite',
    '@aiao/rxdb-plugin-history',
    '@aiao/rxdb-plugin-querycache',
    '@aiao/rxdb-plugin-sync'
  ]);
  assert.ok(scenarios.get('local-encrypted').packages.includes('@aiao/rxdb-adapter-encrypted'));
  assert.deepEqual(scenarios.get('local-encrypted').plugins, []);
  assert.deepEqual(scenarios.get('miniprogram').slots, { local: '@aiao/rxdb-adapter-miniprogram' });
  assert.deepEqual(scenarios.get('electron').slots, { local: '@aiao/rxdb-adapter-electron' });
  assert.ok(!scenarios.get('electron').packages.includes('@aiao/rxdb-adapter-pglite'));
  const packages = new Map(knowledge.development.packages.map(pkg => [pkg.name, pkg]));
  const implementationEdge = packages
    .get('@aiao/rxdb-adapter-wa-sqlite')
    .implementationDependencies.find(edge => edge.name === '@aiao/rxdb-adapter-sqlite-core');
  assert.equal(implementationEdge.kind, 'dependencies');
  assert.equal(implementationEdge.optional, false);
  const backendEdge = packages
    .get('@aiao/rxdb-adapter-miniprogram')
    .implementationDependencies.find(edge => edge.name === '@aiao/rxdb-adapter-wa-sqlite');
  assert.equal(backendEdge.kind, 'dependencies');
  const optionalEdge = packages
    .get('@aiao/rxdb-adapter-electron')
    .implementationDependencies.find(edge => edge.name === '@aiao/rxdb-adapter-pglite');
  assert.equal(optionalEdge.kind, 'peerDependencies');
  assert.equal(optionalEdge.optional, true);
});

for (const role of ['shared-impl', 'capability']) {
  test(`${role} 不能放进情景的 backend 槽位`, () => {
    const changed = copy();
    const name = changed.packages.find(pkg => pkg.role === role).name;
    changed.scenarios[0].packages.push(name);
    changed.scenarios[0].slots.local = name;
    const errors = auditPackageGraph(changed, records);
    assert.ok(
      errors.some(error => error.includes(changed.scenarios[0].id) && error.includes('local') && error.includes(name))
    );
  });
}

test('QueryCache 的 inject 指向已删除的 history 提供者时定位情景和缺少的插件', () => {
  const changed = copy();
  changed.packages = changed.packages.filter(pkg => pkg.name !== '@aiao/rxdb-plugin-history');
  const withoutHistory = records.filter(record => record.name !== '@aiao/rxdb-plugin-history');
  const errors = auditPackageGraph(changed, withoutHistory);
  assert.ok(errors.some(error => error.includes('http-querycache') && error.includes('plugin:history')));
});

test('损坏的包字段先返回 schema 错误，不能继续情景计算并抛异常', () => {
  const changed = copy();
  changed.packages.find(pkg => pkg.name === '@aiao/rxdb-adapter-pglite').slots = null;
  const errors = auditPackageGraph(changed, records, 'fixture/facts.json');
  assert.ok(
    errors.some(
      error =>
        error.includes('fixture/facts.json') && error.includes('@aiao/rxdb-adapter-pglite') && error.includes('slots')
    )
  );
});

test('manifest 安装边循环与未知兄弟包均被拒绝', () => {
  const cyclic = structuredClone(records);
  cyclic.find(p => p.name === '@aiao/rxdb').manifest.dependencies = { '@aiao/rxdb-adapter-pglite': 'workspace:*' };
  assert.ok(auditPackageGraph(copy(), cyclic).some(error => error.includes('循环')));
  cyclic[0].manifest.optionalDependencies = { '@aiao/missing': '*' };
  assert.ok(auditPackageGraph(copy(), cyclic).some(error => error.includes('@aiao/missing')));
});

test('inject 的前置提供者缺位时门禁失败', () => {
  const changed = copy();
  changed.packages.find(p => p.name === '@aiao/rxdb-plugin-history').plugin.class = 'WrongClass';
  assert.ok(auditPackageGraph(changed, records).some(error => error.includes('WrongClass')));
});

test('发布版本来自快照，未发布树插件不进入投递，生成两次字节一致', () => {
  const a = buildKnowledge(copy(), records, release, input);
  const b = buildKnowledge(copy(), records, release, input);
  assert.equal(a.version, 'v1.2.3');
  assert.ok(!a.delivery.packages.some(p => p.name === '@aiao/rxdb-plugin-tree'));
  assert.ok(!a.delivery.scenarios.some(s => s.id === 'tree'));
  assert.deepEqual(renderKnowledge(a, input.template), renderKnowledge(b, input.template));
});

test('事实、manifest、模板、样例与编译选项均参与摘要', () => {
  const baseline = buildKnowledge(copy(), records, release, input).digest;
  const variants = [
    { ...input, template: input.template + 'changed' },
    { ...input, sample: input.sample + 'changed' },
    { ...input, compilerOptions: { strict: false } }
  ];
  for (const changed of variants) assert.notEqual(buildKnowledge(copy(), records, release, changed).digest, baseline);
  const changed = copy();
  changed.scenarios[0].description += 'changed';
  assert.notEqual(buildKnowledge(changed, records, release, input).digest, baseline);
  const manifests = structuredClone(records);
  manifests[0].manifest.version = '1.2.4';
  assert.notEqual(buildKnowledge(copy(), manifests, release, input).digest, baseline);
});

test('真实 git 发现读取标签树，标签之外的新包不投递；无标签明确失败', async () => {
  const root = await mkdtemp(join(tmpdir(), 'package-graph-fixture-'));
  try {
    await cp(fixture, root, { recursive: true });
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'user.name', 'Fixture');
    assert.throws(() => discoverRelease(root), /release|tag|标签/);
    git('add', '.');
    git('commit', '-qm', 'fixture');
    git('tag', 'v1.2.3');
    await rm(join(root, 'packages/rxdb-test'), { recursive: true });
    const found = discoverRelease(root);
    assert.equal(found.tag, 'v1.2.3');
    assert.ok(found.packages.some(p => p.name === '@aiao/rxdb-test'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('提交生成物检查能检出手改，不会静默覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-fixture-'));
  try {
    const rendered = renderKnowledge(buildKnowledge(copy(), records, release, input), input.template);
    assert.equal(checkGenerated(root, rendered).length, 2);
    assert.deepEqual(checkGenerated(root, rendered, true), []);
    assert.deepEqual(checkGenerated(root, rendered), []);
    await writeFile(join(root, 'requirements/generated/package-knowledge.md'), 'tampered');
    assert.equal(checkGenerated(root, rendered).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('损坏的顶层或数组项返回带来源的 schema 错误', () => {
  for (const changed of [null, { ...copy(), scenarios: [null] }, { ...copy(), packages: [null] }]) {
    const errors = auditPackageGraph(changed, records, 'fixture/facts.json');
    assert.ok(errors.length);
    assert.ok(errors.every(error => error.includes('fixture/facts.json')));
  }
});

test('两个目录使用同一 manifest.name 会定位重复包', () => {
  const duplicated = [...records, { ...records[0], source: 'fixture/duplicate/package.json' }];
  assert.ok(
    auditPackageGraph(copy(), duplicated).some(
      error => error.includes('重复') && error.includes('fixture/duplicate/package.json')
    )
  );
});
