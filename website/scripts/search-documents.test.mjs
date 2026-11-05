import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(new URL('../package.json', import.meta.url));
const scannerPath = path.join(
  path.dirname(require.resolve('@easyops-cn/docusaurus-search-local')),
  'utils/scanDocuments.js'
);
const config = { ignoreCssSelectors: ['.excluded'], forceIgnoreNoIndex: false };

const scanner = t => {
  delete require.cache[scannerPath];
  t.after(() => delete require.cache[scannerPath]);
  return require(scannerPath).scanDocuments;
};

const directory = async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiao-search-documents-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
};

const page = (title, content) =>
  `<html><head><title>${title}</title></head><body><main>${content}</main></body></html>`;

test('搜索扫描保留输入顺序、全局 ID、元数据、锚点及未列出页面规则', async t => {
  const root = await directory(t);
  const alphaPath = path.join(root, 'alpha.html');
  const hiddenPath = path.join(root, 'hidden.html');
  const betaPath = path.join(root, 'beta.html');
  await writeFile(
    alphaPath,
    `<html><head><meta name="description" content="Alpha summary"><meta name="keywords" content="one,two"></head><body><a class="navbar__link--active">Docs</a><article><header><h1>Alpha</h1></header><p>Alpha body.</p><h2>Details<a class="hash-link" href="/docs/alpha#details">#</a></h2><p>Details body.</p><p class="excluded">Not indexed.</p><h2>External<a class="hash-link" href="/other#external">#</a></h2><p>External body.</p></article></body></html>`
  );
  await writeFile(
    hiddenPath,
    '<html><head><meta name="robots" content="noindex"></head><body><main>Hidden</main></body></html>'
  );
  await writeFile(betaPath, page('Beta', 'Beta body.'));
  const scan = scanner(t);
  const result = await scan(
    [
      { filePath: alphaPath, url: '/docs/alpha', type: 'docs' },
      { filePath: hiddenPath, url: '/hidden', type: 'page' },
      { filePath: betaPath, url: '/beta', type: 'page' }
    ],
    config
  );

  assert.deepEqual(result, [
    [
      { i: 1, t: 'Alpha', u: '/docs/alpha', b: ['Docs'] },
      { i: 5, t: 'Beta', u: '/beta', b: [] }
    ],
    [{ i: 3, t: 'Details', u: '/docs/alpha', h: '#details', p: 1 }],
    [{ i: 1, t: 'Alpha summary', s: 'Alpha', u: '/docs/alpha', p: 1 }],
    [{ i: 1, t: 'one, two', s: 'Alpha', u: '/docs/alpha', p: 1 }],
    [
      { i: 2, t: 'Alpha body.', s: 'Alpha', u: '/docs/alpha', h: '', p: 1 },
      { i: 4, t: 'Details body.', s: 'Details', u: '/docs/alpha', h: '#details', p: 1 },
      { i: 6, t: 'Beta body.', s: 'Beta', u: '/beta', h: '', p: 5 }
    ]
  ]);
  const next = await scan([{ filePath: betaPath, url: '/next', type: 'page' }], config);
  assert.equal(next[0][0].i, 7);
  assert.equal(next[4][0].i, 8);
});

test('搜索扫描逐页读取，站点规模增长不会增加同时驻留的 HTML 数量', async t => {
  const root = await directory(t);
  const filePath = path.join(root, 'document.html');
  await writeFile(filePath, page('Document', 'Searchable content.'));
  const readFile = fs.readFile;
  let active = 0;
  let peak = 0;
  t.mock.method(fs, 'readFile', (file, options, callback) => {
    active += 1;
    peak = Math.max(peak, active);
    return readFile(file, options, (error, contents) =>
      setTimeout(() => {
        active -= 1;
        callback(error, contents);
      }, 2)
    );
  });
  const scan = scanner(t);
  const documents = Array.from({ length: 32 }, (_, index) => ({ filePath, url: `/docs/${index}`, type: 'page' }));
  const result = await scan(documents, config);

  assert.equal(result[0].length, documents.length);
  assert.equal(peak, 1);
  assert.equal(active, 0);
});

test('搜索扫描保留文件读取异常，不吞错生成缺失的索引', async t => {
  const root = await directory(t);
  const filePath = path.join(root, 'missing.html');
  await assert.rejects(scanner(t)([{ filePath, url: '/missing', type: 'page' }], config), error => {
    assert.equal(error.code, 'ENOENT');
    assert.equal(error.path, filePath);
    return true;
  });
});
