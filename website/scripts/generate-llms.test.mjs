import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readSiteUrl, renderLlms } from './generate-llms.mjs';

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
        version: '1.2.3'
      },
      {
        name: '@aiao/rxdb-adapter-pglite',
        description: '本地后端',
        role: 'backend',
        slots: ['local'],
        hosts: ['node'],
        framework: null,
        version: '1.2.3'
      }
    ],
    scenarios: [
      {
        description: '纯本地',
        packages: ['@aiao/rxdb', '@aiao/rxdb-adapter-pglite'],
        slots: { local: '@aiao/rxdb-adapter-pglite' },
        plugins: [],
        timing: ['use-before-connect']
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

const manifests = new Map([
  ['@aiao/rxdb', { homepage: 'https://rxdb.netlify.app/docs/getting-started' }],
  ['@aiao/rxdb-adapter-pglite', { homepage: 'https://rxdb.netlify.app/docs/adapters/pglite' }]
]);

const docs = [
  { relativePath: 'getting-started/install.md', source: '---\ntitle: 安装\n---\n\n# 安装\n\n```ts\nconst x = 1;\n```' }
];

test('site URL comes from Docusaurus config and rejects missing or non HTTP URLs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'llms-config-'));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'valid.ts'), "export default { url: 'https://docs.example.test' };\n");
  await writeFile(join(root, 'invalid.ts'), "export default { url: 'docs.example.test' };\n");
  await writeFile(join(root, 'missing.ts'), 'export default {};\n');
  assert.equal(readSiteUrl(join(root, 'valid.ts')), 'https://docs.example.test');
  assert.throws(() => readSiteUrl(join(root, 'missing.ts')), /缺少 Docusaurus url/);
  assert.throws(() => readSiteUrl(join(root, 'invalid.ts')), /必须是 HTTP/);
});

test('published package links use the configured site host and unpublished packages have no install command', () => {
  const rendered = renderLlms({
    siteUrl: 'https://docs.example.test',
    knowledge,
    manifests,
    docs
  });
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/docs\/getting-started/);
  assert.match(rendered.index, /https:\/\/docs\.example\.test\/docs\/adapters\/pglite/);
  assert.doesNotMatch(rendered.index, /rxdb\.netlify\.app/);
  assert.match(rendered.index, /@aiao\/rxdb-model.*未发布/);
  assert.doesNotMatch(rendered.index, /pnpm add @aiao\/rxdb-model/);
  assert.match(rendered.full, /# 安装/);
  assert.match(rendered.full, /const x = 1;/);
  assert.ok(rendered.indexBytes > 0);
  assert.ok(rendered.fullBytes > rendered.indexBytes);
});

test('UTF-8 byte limits fail instead of truncating Chinese or code blocks', () => {
  assert.throws(
    () =>
      renderLlms({
        siteUrl: 'https://docs.example.test',
        knowledge,
        manifests,
        docs,
        limits: { indexBytes: 10, fullBytes: 100000 }
      }),
    /llms\.txt 超出 UTF-8 上限/
  );
  assert.throws(
    () =>
      renderLlms({
        siteUrl: 'https://docs.example.test',
        knowledge,
        manifests,
        docs,
        limits: { indexBytes: 100000, fullBytes: 10 }
      }),
    /llms-full\.txt 超出 UTF-8 上限/
  );
});
