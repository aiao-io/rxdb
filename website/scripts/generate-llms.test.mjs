import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { generateLlms, KNOWLEDGE_PATH, renderLlms } from './generate-llms.mjs';

const knowledge = {
  version: 'v1.2.3',
  digest: 'digest',
  delivery: {
    packages: [
      {
        name: '@aiao/rxdb',
        description: '核心',
        role: 'core',
        slots: [],
        hosts: ['node'],
        framework: null,
        version: '1.2.3',
        homepage: 'https://rxdb.aiao.io/docs/getting-started'
      },
      {
        name: '@aiao/rxdb-adapter-pglite',
        description: '本地后端',
        role: 'backend',
        slots: ['local'],
        hosts: ['node'],
        framework: null,
        version: '1.2.3',
        homepage: 'https://rxdb.aiao.io/docs/adapters/pglite',
        notes: '仅 memory 存储'
      },
      {
        name: '@aiao/rxdb-react',
        description: 'React 绑定',
        role: 'binding',
        slots: [],
        hosts: ['browser'],
        framework: 'react',
        version: '1.2.3',
        homepage: null
      },
      {
        name: '@aiao/rxdb-adapter-desktop',
        description: '已移除的桌面后端',
        role: 'backend',
        slots: ['local'],
        hosts: ['electron'],
        framework: null,
        version: '1.2.3',
        homepage: 'docs/adapters/desktop',
        retired: true
      }
    ],
    scenarios: [
      {
        description: '纯本地',
        packages: ['@aiao/rxdb', '@aiao/rxdb-adapter-pglite'],
        slots: { local: '@aiao/rxdb-adapter-pglite' },
        plugins: [],
        timing: ['use-before-connect']
      },
      {
        description: 'HTTP QueryCache',
        packages: ['@aiao/rxdb'],
        slots: {},
        plugins: [{ factory: 'rxDBPluginHistory' }, { factory: 'rxDBPluginQueryCache' }],
        timing: []
      }
    ]
  },
  development: {
    packages: [
      { name: '@aiao/rxdb-model', description: '开发包' },
      { name: '@aiao/rxdb', description: '核心' },
      { name: '@aiao/rxdb-adapter-pglite', description: '本地后端' }
    ]
  },
  sample: {
    install: 'pnpm add @aiao/rxdb@^1.2.3 @aiao/rxdb-adapter-pglite@^1.2.3',
    devInstall: 'pnpm add -D typescript@~6.0.3',
    source: 'console.log("offline");'
  }
};

const docs = [
  { relativePath: 'getting-started/install.md', source: '---\ntitle: 安装\n---\n\n# 安装\n\n```ts\nconst x = 1;\n```' }
];

const render = (overrides = {}) => renderLlms({ siteUrl: 'https://docs.example.test/', knowledge, docs, ...overrides });

test('links use the configured site and keep only the homepage path; unpublished packages get no install command', () => {
  const rendered = render();
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/docs\/getting-started/);
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/docs\/adapters\/pglite/);
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/docs\/frameworks\/react\//);
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/docs\/adapters\/desktop/);
  assert.match(rendered.index, /完整文档：https:\/\/docs\.example\.test\/llms-full\.txt/);
  assert.doesNotMatch(rendered.index, /rxdb\.netlify\.app/);
  assert.match(rendered.index, /@aiao\/rxdb-model.*未发布/);
  assert.doesNotMatch(rendered.index, /pnpm add @aiao\/rxdb-model/);
  assert.match(rendered.index, /只为发布标签 `v1\.2\.3` 中的包/);
  assert.match(rendered.full, /# 安装/);
  assert.match(rendered.full, /const x = 1;/);
  assert.ok(rendered.indexBytes > 0);
  assert.ok(rendered.fullBytes > rendered.indexBytes);
});

test('baseUrl prefixes every site link', () => {
  const rendered = render({ siteUrl: 'https://docs.example.test/rxdb/' });
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/rxdb\/docs\/adapters\/pglite/);
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/rxdb\/llms-full\.txt/);
});

test('retired packages and notes are marked; plugins render as an unordered set', () => {
  const rendered = render();
  assert.match(rendered.index, /rxdb-adapter-desktop[\s\S]*?状态：已从仓库移除，`v1\.2\.3` 之后不再发布/);
  assert.match(rendered.index, /rxdb-adapter-pglite[\s\S]*?备注：仅 memory 存储/);
  assert.match(rendered.index, /插件（顺序不限）：`rxDBPluginHistory`、`rxDBPluginQueryCache`/);
  assert.doesNotMatch(rendered.index, /→/);
});

test('unknown roles fail instead of falling back', () => {
  const broken = structuredClone(knowledge);
  broken.delivery.packages[0].role = 'mystery';
  assert.throws(() => render({ knowledge: broken }), /@aiao\/rxdb: 未知角色 mystery/);
});

test('UTF-8 byte limits fail instead of truncating Chinese or code blocks', () => {
  assert.throws(() => render({ limits: { indexBytes: 10, fullBytes: 100000 } }), /llms\.txt 超出 UTF-8 上限/);
  assert.throws(() => render({ limits: { indexBytes: 100000, fullBytes: 10 } }), /llms-full\.txt 超出 UTF-8 上限/);
});

test('generation reads the committed knowledge only, without git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'llms-root-'));
  try {
    const file = join(root, KNOWLEDGE_PATH);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(knowledge));
    await mkdir(join(root, 'website/docs/getting-started'), { recursive: true });
    await writeFile(join(root, 'website/docs/getting-started/install.md'), docs[0].source);
    const outDir = join(root, 'out');
    generateLlms({ root, outDir, siteUrl: 'https://docs.example.test/' });
    assert.match(await readFile(join(outDir, 'llms.txt'), 'utf8'), /发布版本：`v1\.2\.3`/);
    assert.match(await readFile(join(outDir, 'llms-full.txt'), 'utf8'), /## getting-started\/install\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
