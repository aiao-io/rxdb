import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { releaseFromSnapshot, snapshotFromKnowledgeJson } from './lib/package-knowledge.mjs';
import { SKILL_MAX_BYTES, renderSkill } from './lib/package-skill.mjs';
import {
  analyzePackageGraph,
  buildKnowledge,
  readKnowledgeInput,
  renderKnowledge,
  scanPackages
} from './package-graph.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = new URL('./__fixtures__/package-graph/pass/', import.meta.url);
const facts = JSON.parse(await readFile(new URL('facts.json', fixture), 'utf8'));
const records = scanPackages(new URL('packages/', fixture));
const release = { tag: 'v1.2.3', version: '1.2.3', packages: records.filter(p => p.name !== '@aiao/rxdb-plugin-tree') };
const input = {
  compilerDependencies: { typescript: '~6.0.3', '@types/node': '^26.0.0', '@types/emscripten': '^1.41.6' },
  template: await readFile(new URL('template.md', fixture), 'utf8'),
  skillTemplate: await readFile(new URL('skill-template.md', fixture), 'utf8'),
  sample: await readFile(new URL('sample.ts', fixture), 'utf8'),
  compilerOptions: { strict: true },
  install: ['@aiao/rxdb', '@aiao/rxdb-adapter-pglite']
};
const knowledge = () => buildKnowledge(analyzePackageGraph(facts, records), release, input);
const render = () => renderSkill(knowledge(), input.skillTemplate);

/** 固定 v0.0.28 的发布规模形态，不随工作区增包或发布标签变化。 */
function releaseScaleKnowledge() {
  const allHosts = ['browser', 'node', 'electron', 'tauri', 'miniprogram'];
  const groups = [
    { names: ['rxdb'], role: 'core', hosts: allHosts, slots: [] },
    { names: ['utils'], role: 'standalone', hosts: allHosts, slots: [] },
    { names: ['code-editor'], role: 'standalone', hosts: ['browser'], slots: [] },
    { names: ['rxdb-model'], role: 'model', hosts: ['browser', 'node'], slots: [] },
    { names: ['rxdb-client-generator'], role: 'tool', hosts: ['node'], slots: [] },
    { names: ['rxdb-devtools'], role: 'tool', hosts: ['browser'], slots: [] },
    { names: ['rxdb-taro'], role: 'tool', hosts: ['node', 'miniprogram'], slots: [] },
    { names: ['rxdb-test'], role: 'tool', hosts: ['browser', 'node'], slots: [] },
    { names: ['rxdb-adapter-sqlite-core'], role: 'shared-impl', hosts: allHosts, slots: [] },
    {
      names: ['rxdb-adapter-encrypted'],
      role: 'capability',
      hosts: ['browser', 'node', 'electron', 'tauri'],
      slots: [],
      notes:
        '依赖 WebCrypto（crypto.subtle）。小程序宿主会随 sqlite-core 加载本包，但没有 crypto.subtle，加密能力不可用。'
    },
    { names: ['rxdb-adapter-electron'], role: 'backend', hosts: ['electron'], slots: ['local'] },
    { names: ['rxdb-adapter-tauri'], role: 'backend', hosts: ['tauri'], slots: ['local'] },
    {
      names: ['rxdb-adapter-miniprogram'],
      role: 'backend',
      hosts: ['miniprogram'],
      slots: ['local'],
      notes: '实验性；仅已登记平台；单连接，不承诺崩溃恢复；Android 验证状态见兼容性矩阵。'
    },
    {
      names: ['rxdb-adapter-sqlite', 'rxdb-adapter-sqlite-wasm', 'rxdb-adapter-sqliteai', 'rxdb-adapter-wa-sqlite'],
      role: 'backend',
      hosts: ['browser'],
      slots: ['local']
    },
    { names: ['rxdb-adapter-pglite'], role: 'backend', hosts: ['browser', 'node'], slots: ['local'] },
    {
      names: ['rxdb-adapter-http', 'rxdb-adapter-supabase'],
      role: 'backend',
      hosts: ['browser', 'node'],
      slots: ['remote']
    },
    {
      names: [
        'rxdb-plugin-graph',
        'rxdb-plugin-history',
        'rxdb-plugin-querycache',
        'rxdb-plugin-replay',
        'rxdb-plugin-search',
        'rxdb-plugin-storage',
        'rxdb-plugin-sync',
        'rxdb-plugin-tree',
        'rxdb-plugin-working-tree'
      ],
      role: 'plugin',
      hosts: ['browser', 'node'],
      slots: []
    },
    { names: ['rxdb-plugin-workspace'], role: 'plugin', hosts: ['browser'], slots: [] }
  ];
  const packages = groups.flatMap(({ names, ...metadata }) =>
    names.map(name => ({ name: `@aiao/${name}`, framework: null, ...metadata }))
  );
  const bindingFamilies = [
    'code-editor',
    'rxdb',
    'rxdb-model',
    'rxdb-plugin-replay',
    'rxdb-plugin-search',
    'rxdb-plugin-tree',
    'rxdb-plugin-working-tree'
  ];
  for (const family of bindingFamilies) {
    packages.push(
      ...['angular', 'react', 'vue'].map(framework => ({
        name: `@aiao/${family}-${framework}`,
        role: 'binding',
        hosts: ['browser'],
        slots: [],
        framework
      }))
    );
  }
  const value = buildKnowledge(analyzePackageGraph(facts, records), { ...release, packages: records }, input);
  value.version = 'v0.0.28';
  value.delivery.packages = packages.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  value.delivery.scenarios = value.delivery.scenarios.filter(scenario =>
    [
      'binding-angular',
      'binding-react',
      'binding-vue',
      'code-editor',
      'graph',
      'http-querycache',
      'local',
      'supabase',
      'tree'
    ].includes(scenario.id)
  );
  value.sample = {
    install: 'pnpm add @aiao/rxdb@^0.0.28 @aiao/rxdb-adapter-pglite@^0.0.28 @aiao/rxdb-plugin-history@^0.0.28',
    devInstall: 'pnpm add -D typescript@~6.0.3 @types/node@^26.0.0 @types/emscripten@^1.41.6',
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      experimentalDecorators: true,
      skipLibCheck: false,
      types: ['node', 'emscripten']
    },
    source: `import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import assert from 'node:assert/strict';

@Entity({
  name: 'AiNote',
  namespace: 'ai_example',
  tableName: 'notes',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
export class Note extends EntityBase {
  label!: string;
}

const database = new RxDB({
  dbName: 'aiao-ai-local',
  context: { userId: 'ai-example' },
  entities: [Note],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

database.use(rxDBPluginHistory);
database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));

try {
  const adapter = await database.connect('pglite');
  assert.ok(adapter instanceof RxDBAdapterPGlite);
  await adapter.transaction(async executor => {
    const repository = executor.getRepository(Note);
    const draft = database.entityManager.instantiate(Note);
    draft.label = 'created';
    const created = await repository.create(draft);
    const query = { where: { combinator: 'and' as const, rules: [] } };
    const rows = await repository.find(query);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.label, 'created');
    await repository.update(created, { label: 'updated' });
    assert.equal((await repository.find(query))[0]?.label, 'updated');
    await repository.remove(created);
    assert.equal((await repository.find(query)).length, 0);
  });
  console.log('✅ 离线样例：初始化、CRUD 与事务执行器全部通过');
} finally {
  await database.disconnectAll();
}`
  };
  return value;
}

/** 搭一个带 facts、fixture packages、脚本与根 manifest 的临时仓库根，快照写入与否由参数决定。 */
async function materializeRoot(withSnapshot) {
  const root = await mkdtemp(join(tmpdir(), 'skill-generate-fixture-'));
  await cp(fixture, root, { recursive: true });
  await mkdir(join(root, 'requirements'), { recursive: true });
  await writeFile(join(root, 'requirements/package-graph.json'), readFileSync(new URL('facts.json', fixture)));
  await mkdir(join(root, 'scripts/audit'), { recursive: true });
  await cp(join(here, 'lib'), join(root, 'scripts/audit/lib'), { recursive: true });
  await cp(join(here, 'templates'), join(root, 'scripts/audit/templates'), { recursive: true });
  await writeFile(join(root, 'scripts/audit/package-graph.mjs'), readFileSync(join(here, 'package-graph.mjs')));
  await writeFile(join(root, 'scripts/audit/generate-skill.mjs'), readFileSync(join(here, 'generate-skill.mjs')));
  await cp(join(here, '../examples/ai-local'), join(root, 'scripts/examples/ai-local'), { recursive: true });
  await writeFile(join(root, 'package.json'), readFileSync(join(here, '../../package.json')));
  // 库代码只从工作区 node_modules 解析 typescript（fixture 树没有自己的依赖目录）
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await symlink(join(here, '../../node_modules/typescript'), join(root, 'node_modules/typescript'), 'dir');
  if (withSnapshot) {
    const factsInRoot = JSON.parse(readFileSync(join(root, 'requirements/package-graph.json'), 'utf8'));
    const recordsInRoot = scanPackages(join(root, 'packages'));
    const snapshotRelease = {
      tag: 'v1.2.3',
      version: '1.2.3',
      packages: recordsInRoot.filter(record => record.name !== '@aiao/rxdb-plugin-tree')
    };
    const snapshotKnowledge = buildKnowledge(
      analyzePackageGraph(factsInRoot, recordsInRoot, join(root, 'requirements/package-graph.json')),
      snapshotRelease,
      readKnowledgeInput(root)
    );
    await mkdir(join(root, 'requirements/generated'), { recursive: true });
    await writeFile(
      join(root, 'requirements/generated/package-knowledge.json'),
      renderKnowledge(snapshotKnowledge, readKnowledgeInput(root).template).json
    );
  }
  return root;
}

test('SKILL.md 渲染带 frontmatter name/description、版本与事实摘要', () => {
  const skill = render();
  assert.match(skill, /^---\nname: aiao-rxdb\n/);
  assert.match(skill, /^description: .+$/m);
  const value = knowledge();
  assert.ok(skill.includes(value.version));
  assert.ok(skill.includes(value.digest));
});

test('正文只覆盖投递范围：未发布树插件与情景不出现，发布包与样例在列', () => {
  const skill = render();
  assert.ok(!skill.includes('rxdb-plugin-tree'));
  assert.ok(!skill.includes('树插件'));
  const packageTable = skill.match(/## 投递范围安装清单\n\n([\s\S]*?)\n\n## 组合情景/)?.[1];
  assert.ok(packageTable?.includes('包名省略 `@aiao/`，安装时补全'));
  assert.ok(packageTable?.includes('|rxdb-adapter-pglite|'));
  assert.ok(packageTable?.includes('|browser,node|'));
  assert.ok(skill.includes('pnpm add'));
  assert.ok(skill.includes('"strict"'));
});

test('情景时序令牌展开为可读文本，未知令牌报错', () => {
  const skill = render();
  assert.ok(skill.includes('init() 之前'));
  assert.ok(skill.includes('connect() 之前'));
  const changed = structuredClone(facts);
  changed.scenarios[0].timing = ['use-before-unknown'];
  const changedKnowledge = buildKnowledge(analyzePackageGraph(changed, records), release, input);
  assert.throws(() => renderSkill(changedKnowledge, input.skillTemplate), /use-before-unknown/);
});

test('同一输入渲染两次逐字节一致', () => {
  assert.equal(render(), render());
});

test('固定 51 包压力夹具保留框架族、宿主、槽位、情景与完整样例，且不超过体积预算', async t => {
  const value = releaseScaleKnowledge();
  const template = await readFile(new URL('./templates/skill-aiao-rxdb.md', import.meta.url), 'utf8');
  assert.equal(value.delivery.packages.length, 51);
  assert.deepEqual([...new Set(value.delivery.packages.flatMap(pkg => pkg.hosts))].sort(), [
    'browser',
    'electron',
    'miniprogram',
    'node',
    'tauri'
  ]);
  for (const family of ['rxdb', 'rxdb-model', 'rxdb-plugin-working-tree', 'code-editor']) {
    for (const framework of ['angular', 'react', 'vue']) {
      assert.ok(value.delivery.packages.some(pkg => pkg.name === `@aiao/${family}-${framework}`));
    }
  }

  const skill = renderSkill(value, template);
  const bytes = Buffer.byteLength(skill, 'utf8');
  assert.ok(bytes <= SKILL_MAX_BYTES);
  t.diagnostic(`固定 v0.0.28 形态：51 包、${value.delivery.scenarios.length} 情景、${bytes} 字节`);
  const rows = skill
    .split('\n')
    .filter(line => line.startsWith('|'))
    .map(line =>
      line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim())
    );
  for (const pkg of value.delivery.packages) {
    const row = rows.find(cells => [pkg.name, pkg.name.replace(/^@aiao\//, '')].includes(cells[0]));
    assert.ok(row, `缺少发布包 ${pkg.name}`);
    assert.equal(row[1], pkg.role);
    assert.deepEqual(row[2] ? row[2].split(',').map(slot => slot.trim()) : [], pkg.slots);
    assert.deepEqual(
      row[3]
        .split('；')[0]
        .split(',')
        .map(host => host.trim()),
      pkg.hosts
    );
    assert.equal(row[4], pkg.framework ?? '');
    if (pkg.notes) assert.ok(row[3].includes(pkg.notes), `${pkg.name} 的宿主限制丢失`);
  }
  for (const scenario of value.delivery.scenarios) {
    const section = skill.split(`### ${scenario.description}\n`)[1]?.split('\n### ')[0];
    assert.ok(section, `缺少情景 ${scenario.id}`);
    for (const name of scenario.packages) {
      assert.ok(section.includes(name.replace(/^@aiao\//, '')), `${scenario.id} 缺少必需包 ${name}`);
    }
    for (const [slot, name] of Object.entries(scenario.slots)) {
      assert.ok(section.includes(`${slot}=${name.replace(/^@aiao\//, '')}`), `${scenario.id} 缺少 ${slot} 槽位`);
    }
    for (const { factory } of scenario.plugins) assert.ok(section.includes(factory));
  }
  assert.ok(skill.includes('init() 之前'));
  assert.ok(skill.includes('connect() 之前'));
  assert.match(skill, /事务内禁止.*entity\.save\(\).*永久挂起/);
  assert.ok(skill.includes(value.sample.install));
  assert.ok(skill.includes(value.sample.devInstall));
  assert.ok(skill.includes(value.sample.source.trim()));
  assert.equal(renderSkill(value, template), skill);
});

test('省略公共前缀时保留其他 scope 与已退役标记，不改写安装命令或代码', () => {
  const value = knowledge();
  value.delivery.packages.push({
    name: '@other/bridge',
    role: 'backend',
    hosts: ['node'],
    slots: ['local'],
    retired: true
  });
  value.delivery.scenarios[0].packages.push('@other/bridge');
  const skill = renderSkill(value, input.skillTemplate);
  assert.ok(skill.includes('|@other/bridge（已退役）|backend|local|node||'));
  assert.ok(skill.includes('、@other/bridge'));
  assert.ok(skill.includes(value.sample.install));
  assert.ok(skill.includes(value.sample.source.trim()));
});

test('模板引用未知字段报错', () => {
  assert.throws(() => renderSkill(knowledge(), '{{unknown}}'), /unknown/);
});

test('超出 8192 字节上限时报错而非截断', () => {
  const oversize = `---\nname: aiao-rxdb\ndescription: oversize fixture\n---\n${'x'.repeat(SKILL_MAX_BYTES + 1)}`;
  assert.throws(() => renderSkill(knowledge(), oversize), /8192/);
});

test('8192 字节上限包含自动追加的结尾换行', () => {
  const prefix = '---\nname: aiao-rxdb\ndescription: exact fixture\n---\n';
  const withoutNewline = `${prefix}${'x'.repeat(SKILL_MAX_BYTES - Buffer.byteLength(prefix))}`;
  assert.throws(() => renderSkill(knowledge(), withoutNewline), /8192/);
  const exact = `${prefix}${'x'.repeat(SKILL_MAX_BYTES - Buffer.byteLength(prefix) - 1)}\n`;
  assert.equal(Buffer.byteLength(renderSkill(knowledge(), exact), 'utf8'), SKILL_MAX_BYTES);
});

test('frontmatter 缺 name 或 description 时报错', () => {
  for (const template of [
    `---\ndescription: missing name\n---\nbody`,
    `---\nname: aiao-rxdb\n---\nbody`,
    `name: aiao-rxdb\ndescription: no fence\n`
  ]) {
    assert.throws(() => renderSkill(knowledge(), template), /frontmatter|name|description/);
  }
});

test('投递快照提取发布标签与已发布版本', () => {
  const snapshot = snapshotFromKnowledgeJson(JSON.parse(renderKnowledge(knowledge(), input.template).json));
  assert.equal(snapshot.tag, 'v1.2.3');
  assert.ok(snapshot.packages.some(pkg => pkg.name === '@aiao/rxdb' && pkg.version === '1.2.3'));
  assert.ok(!snapshot.packages.some(pkg => pkg.name === '@aiao/rxdb-plugin-tree'));
});

test('快照构造的发布对象：manifest 版本取快照、tag 不一致或包不存在时报错', () => {
  const snapshot = snapshotFromKnowledgeJson(JSON.parse(renderKnowledge(knowledge(), input.template).json));
  const bumped = records.map(record =>
    record.name === '@aiao/rxdb' ? { ...record, manifest: { ...record.manifest, version: '9.9.9' } } : record
  );
  const fromSnapshot = releaseFromSnapshot(facts, bumped, snapshot);
  assert.equal(fromSnapshot.version, '1.2.3');
  assert.equal(fromSnapshot.packages.find(pkg => pkg.name === '@aiao/rxdb').manifest.version, '1.2.3');
  assert.throws(() => releaseFromSnapshot(facts, records, { ...snapshot, tag: 'v9.9.9' }), /v9\.9\.9.*v1\.2\.3/);
  assert.throws(
    () => releaseFromSnapshot(facts, records, { ...snapshot, packages: [{ name: '@aiao/removed', version: '1.2.3' }] }),
    /@aiao\/removed/
  );
});

test('生成入口把 SKILL.md 写进主包 skills 目录，内容与渲染一致', async () => {
  const root = await materializeRoot(true);
  try {
    const output = execFileSync(process.execPath, [join(root, 'scripts/audit/generate-skill.mjs'), `--root=${root}`], {
      encoding: 'utf8'
    });
    assert.match(output, /SKILL\.md/);
    const written = readFileSync(join(root, 'packages/rxdb/skills/aiao-rxdb/SKILL.md'), 'utf8');
    const factsInRoot = JSON.parse(readFileSync(join(root, 'requirements/package-graph.json'), 'utf8'));
    const recordsInRoot = scanPackages(join(root, 'packages'));
    const snapshot = snapshotFromKnowledgeJson(
      JSON.parse(readFileSync(join(root, 'requirements/generated/package-knowledge.json'), 'utf8'))
    );
    const expected = renderSkill(
      buildKnowledge(
        analyzePackageGraph(factsInRoot, recordsInRoot, join(root, 'requirements/package-graph.json')),
        releaseFromSnapshot(factsInRoot, recordsInRoot, snapshot),
        readKnowledgeInput(root)
      ),
      readKnowledgeInput(root).skillTemplate
    );
    assert.equal(written, expected);
    assert.ok(Buffer.byteLength(written, 'utf8') <= SKILL_MAX_BYTES);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('快照文件缺失时生成入口明确报错', async () => {
  const root = await materializeRoot(false);
  try {
    assert.throws(
      () =>
        execFileSync(process.execPath, [join(root, 'scripts/audit/generate-skill.mjs'), `--root=${root}`], {
          encoding: 'utf8'
        }),
      /package-knowledge\.json 不存在/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
