import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  analyzePackageGraph,
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
const build = (changed = copy(), list = records, inputs = input, snapshot = release) =>
  buildKnowledge(analyzePackageGraph(changed, list), snapshot, inputs);

test('扫描不依赖 src/index.ts，tool 和双槽位组合均合法', () => {
  assert.ok(records.some(p => p.name === '@aiao/rxdb-test'));
  assert.ok(!records.some(p => p.name === '@aiao/private'));
  assert.ok(!records.some(p => p.directory.endsWith('directory-only')));
  assert.deepEqual(auditPackageGraph(copy(), records), []);
});

test('QueryCache 从源码 inject 闭合 history，而本地不带插件', () => {
  const knowledge = build();
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
  ['缺描述', f => delete f.packages[0].description, 'description'],
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
  const knowledge = build();
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

test('@aiao/rxdb 放 dependencies / optionalDependencies 均被拒绝', () => {
  const changed = structuredClone(records);
  const target = changed.find(p => p.name === '@aiao/rxdb-plugin-history');
  target.manifest.dependencies = { '@aiao/rxdb': 'workspace:^' };
  const inDeps = auditPackageGraph(copy(), changed);
  assert.ok(
    inDeps.some(error => error.includes('dependencies') && error.includes('@aiao/rxdb')),
    inDeps.join('\n')
  );
  delete target.manifest.dependencies['@aiao/rxdb'];
  target.manifest.optionalDependencies = { '@aiao/rxdb': 'workspace:^' };
  const inOptional = auditPackageGraph(copy(), changed);
  assert.ok(
    inOptional.some(error => error.includes('optionalDependencies') && error.includes('@aiao/rxdb')),
    inOptional.join('\n')
  );
});

for (const range of ['*', 'workspace:*', '>=1.2.3', '^1.2.3']) {
  test(`@aiao/* peer 写成 ${range} 被拒绝`, () => {
    const changed = structuredClone(records);
    const target = changed.find(p => p.name === '@aiao/rxdb-adapter-http');
    target.manifest.peerDependencies['@aiao/rxdb'] = range;
    const errors = auditPackageGraph(copy(), changed);
    assert.ok(
      errors.some(error => error.includes('peer @aiao/rxdb') && error.includes('workspace:^') && error.includes(range)),
      errors.join('\n')
    );
  });
}

test('留在 dependencies 的 @aiao/* 兄弟边不是 workspace:^ 被拒绝', () => {
  const changed = structuredClone(records);
  const target = changed.find(p => p.name === '@aiao/rxdb-adapter-wa-sqlite');
  target.manifest.dependencies['@aiao/rxdb-adapter-sqlite-core'] = 'workspace:*';
  const errors = auditPackageGraph(copy(), changed);
  assert.ok(
    errors.some(error => error.includes('兄弟依赖 @aiao/rxdb-adapter-sqlite-core') && error.includes('workspace:*')),
    errors.join('\n')
  );
});

test('发布标签树标过的 optional peer 被删即失败，保留则通过（AC#4 正反例）', () => {
  const baseline = structuredClone(records);
  const deleted = structuredClone(records);
  const target = deleted.find(p => p.name === '@aiao/rxdb-adapter-electron');
  delete target.manifest.peerDependenciesMeta['@aiao/rxdb-adapter-pglite'];
  const errors = auditPackageGraph(copy(), deleted, undefined, baseline);
  assert.ok(
    errors.some(
      error =>
        error.includes('rxdb-adapter-electron/package.json') &&
        error.includes('optional peer @aiao/rxdb-adapter-pglite')
    ),
    errors.join('\n')
  );
  assert.deepEqual(auditPackageGraph(copy(), records, undefined, baseline), []);
  assert.deepEqual(auditPackageGraph(copy(), records), []);
});

test('inject 的前置提供者缺位时门禁失败', () => {
  const changed = copy();
  changed.packages.find(p => p.name === '@aiao/rxdb-plugin-history').plugin.class = 'WrongClass';
  assert.ok(auditPackageGraph(changed, records).some(error => error.includes('WrongClass')));
});

test('发布版本来自快照，未发布树插件不进入投递，生成两次字节一致', () => {
  const a = build();
  const b = build();
  assert.equal(a.version, 'v1.2.3');
  assert.ok(!a.delivery.packages.some(p => p.name === '@aiao/rxdb-plugin-tree'));
  assert.ok(!a.delivery.scenarios.some(s => s.id === 'tree'));
  assert.deepEqual(renderKnowledge(a, input.template), renderKnowledge(b, input.template));
});

test('事实、manifest、模板、样例、编译选项与生成器源码均参与摘要', () => {
  const baseline = build().digest;
  const variants = [
    { ...input, template: input.template + 'changed' },
    { ...input, sample: input.sample + 'changed' },
    { ...input, compilerOptions: { strict: false } },
    { ...input, generatorSources: ['changed'] }
  ];
  for (const changed of variants) assert.notEqual(build(copy(), records, changed).digest, baseline);
  const changed = copy();
  changed.scenarios[0].description += 'changed';
  assert.notEqual(build(changed).digest, baseline);
  const manifests = structuredClone(records);
  manifests[0].manifest.version = '1.2.4';
  assert.notEqual(build(copy(), manifests).digest, baseline);
});

test('真实 git 发现只读登记标签的树：更新的标签与工作树改动都不进投递范围；标签不在本地明确失败', async () => {
  const root = await mkdtemp(join(tmpdir(), 'package-graph-fixture-'));
  try {
    await cp(fixture, root, { recursive: true });
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'user.name', 'Fixture');
    git('add', '.');
    git('commit', '-qm', 'fixture');
    assert.throws(() => discoverRelease(root, 'v1.2.3'), /发布标签 v1\.2\.3 不在本地/);
    git('tag', 'v1.2.3');
    await writeFile(join(root, 'packages/rxdb/package.json'), JSON.stringify({ name: '@aiao/rxdb', version: '1.2.4' }));
    git('commit', '-qam', 'bump');
    git('tag', 'v1.2.4');
    await rm(join(root, 'packages/rxdb-test'), { recursive: true });
    const found = discoverRelease(root, 'v1.2.3');
    assert.equal(found.tag, 'v1.2.3');
    assert.equal(found.version, '1.2.3');
    assert.ok(found.packages.some(p => p.name === '@aiao/rxdb-test'));
    assert.ok(!found.packages.some(p => p.name === '@aiao/private'));
    assert.equal(found.packages.find(p => p.name === '@aiao/rxdb').manifest.version, '1.2.3');
    assert.equal(discoverRelease(root, 'v1.2.4').packages.find(p => p.name === '@aiao/rxdb').manifest.version, '1.2.4');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('提交生成物检查能检出手改，不会静默覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-fixture-'));
  try {
    const rendered = renderKnowledge(build(), input.template);
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

test('release 只接受登记的正式版标签，投递范围必须与它一致', () => {
  for (const value of ['v1.2.3-rc.1', '1.2.3', undefined]) {
    const changed = copy();
    changed.release = value;
    assert.ok(auditPackageGraph(changed, records).some(error => error.includes('release')));
  }
  assert.throws(() => build(copy(), records, input, { ...release, tag: 'v1.2.4' }), /v1\.2\.4.*不一致/);
});

test('已发布的包删目录后标 retired 继续投递，release 切走后要求删登记', () => {
  const changed = copy();
  changed.packages.find(pkg => pkg.name === '@aiao/rxdb-test').retired = true;
  const remaining = records.filter(record => record.name !== '@aiao/rxdb-test');
  assert.deepEqual(auditPackageGraph(changed, remaining), []);
  const knowledge = build(changed, remaining);
  assert.equal(knowledge.delivery.packages.find(pkg => pkg.name === '@aiao/rxdb-test').retired, true);
  assert.ok(!knowledge.development.packages.some(pkg => pkg.name === '@aiao/rxdb-test'));
  assert.match(renderKnowledge(knowledge, input.template).markdown, /@aiao\/rxdb-test（已退役）/);
  const next = { ...release, packages: release.packages.filter(record => record.name !== '@aiao/rxdb-test') };
  assert.throws(() => build(changed, remaining, input, next), /退役包 @aiao\/rxdb-test 已不在发布里/);
});

test('退役包仍在 packages/、被情景引用或 retired 非 true 都失败', () => {
  const present = copy();
  present.packages.find(pkg => pkg.name === '@aiao/rxdb-test').retired = true;
  assert.ok(auditPackageGraph(present, records).some(error => error.includes('退役包 @aiao/rxdb-test 仍在')));
  const referenced = copy();
  referenced.packages.find(pkg => pkg.name === '@aiao/code-editor').retired = true;
  const withoutEditor = records.filter(record => record.name !== '@aiao/code-editor');
  assert.ok(
    auditPackageGraph(referenced, withoutEditor).some(
      error => error.includes('code-editor') && error.includes('引用退役包 @aiao/code-editor')
    )
  );
  const invalid = copy();
  invalid.packages[0].retired = false;
  assert.ok(auditPackageGraph(invalid, records).some(error => error.includes('retired')));
});

test('样例 import 的包必须都在安装清单里', () => {
  const sample = "import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';\nimport assert from 'node:assert/strict';\n";
  assert.throws(() => build(copy(), records, { ...input, sample }), /install\.json：@aiao\/rxdb-plugin-sync$/);
  const covered = "import { RxDB } from '@aiao/rxdb/testing';\nimport { local } from './local.js';\n";
  assert.doesNotThrow(() => build(copy(), records, { ...input, sample: covered }));
});

test('plugin.source 指向包目录本身或目录之外都明确失败', () => {
  for (const source of ['.', '../rxdb/src/plugin.ts']) {
    const changed = copy();
    changed.packages.find(pkg => pkg.name === '@aiao/rxdb-plugin-history').plugin.source = source;
    assert.ok(auditPackageGraph(changed, records).some(error => error.includes('必须是包目录内的文件')));
  }
});

test('非 private 的 manifest 缺 name 时指明文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'package-scan-'));
  try {
    await mkdir(join(root, 'nameless'));
    await writeFile(join(root, 'nameless/package.json'), '{"version":"1.0.0"}');
    assert.throws(() => scanPackages(root), /nameless[\\/]package\.json: manifest 缺少 name/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
