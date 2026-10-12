import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SKILL_MAX_BYTES, renderSkill } from './lib/package-skill.mjs';
import {
  analyzePackageGraph,
  buildKnowledge,
  discoverRelease,
  readKnowledgeInput,
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
  assert.ok(skill.includes('@aiao/rxdb-adapter-pglite'));
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

test('模板引用未知字段报错', () => {
  assert.throws(() => renderSkill(knowledge(), '{{unknown}}'), /unknown/);
});

test('超出 8192 字节上限时报错而非截断', () => {
  const oversize = `---\nname: aiao-rxdb\ndescription: oversize fixture\n---\n${'x'.repeat(SKILL_MAX_BYTES + 1)}`;
  assert.throws(() => renderSkill(knowledge(), oversize), /8192/);
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

test('生成入口把 SKILL.md 写进主包 skills 目录，内容与渲染一致', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-generate-fixture-'));
  try {
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
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'user.name', 'Fixture');
    git('add', '.');
    git('commit', '-qm', 'fixture');
    git('tag', 'v1.2.3');
    const output = execFileSync(process.execPath, [join(root, 'scripts/audit/generate-skill.mjs'), `--root=${root}`], {
      encoding: 'utf8'
    });
    assert.match(output, /SKILL\.md/);
    const written = readFileSync(join(root, 'packages/rxdb/skills/aiao-rxdb/SKILL.md'), 'utf8');
    const factsInRoot = JSON.parse(readFileSync(join(root, 'requirements/package-graph.json'), 'utf8'));
    const knowledgeInRoot = buildKnowledge(
      analyzePackageGraph(
        factsInRoot,
        scanPackages(join(root, 'packages')),
        join(root, 'requirements/package-graph.json')
      ),
      discoverRelease(root, factsInRoot.release),
      readKnowledgeInput(root)
    );
    const expected = renderSkill(knowledgeInRoot, readKnowledgeInput(root).skillTemplate);
    assert.equal(written, expected);
    assert.ok(Buffer.byteLength(written, 'utf8') <= SKILL_MAX_BYTES);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
