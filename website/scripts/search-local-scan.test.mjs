import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('搜索索引限制同时读取的页面数，并保留标题、正文与输入顺序', async t => {
  const count = 64;
  let active = 0;
  let peak = 0;
  t.mock.method(fs, 'readFile', (file, _options, callback) => {
    const index = Number(path.basename(file, '.html').slice(5));
    active++;
    peak = Math.max(peak, active);
    setTimeout(() => {
      active--;
      callback(null, `<article><h1>页面 ${index}</h1><p>检索正文 ${index}</p></article>`);
    }, (count - index) % 4);
  });
  const scanner = path.join(
    path.dirname(require.resolve('@easyops-cn/docusaurus-search-local')),
    'utils/scanDocuments.js'
  );
  delete require.cache[scanner];
  const { scanDocuments } = require(scanner);
  const pages = Array.from({ length: count }, (_, index) => ({
    filePath: `/search-fixture/page-${index}.html`,
    url: `/docs/page-${index}`,
    type: 'docs'
  }));

  const [titles, , , , contents] = await scanDocuments(pages, {});

  assert.deepEqual(
    titles.map(doc => [doc.t, doc.u]),
    pages.map((page, index) => [`页面 ${index}`, page.url])
  );
  assert.deepEqual(
    contents.map(doc => [doc.t, doc.u]),
    pages.map((page, index) => [`检索正文 ${index}`, page.url])
  );
  assert.ok(peak <= 8, `同时读取 ${peak} 个页面，超过构建内存预算`);
});
