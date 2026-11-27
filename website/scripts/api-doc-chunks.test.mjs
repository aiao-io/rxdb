import assert from 'node:assert/strict';
import test from 'node:test';
import apiDocChunks from '../src/plugins/api-doc-chunks.js';

const { configureWebpack } = apiDocChunks();
const production = { mode: 'production' };

test('只为生产客户端构建合并 API 文档', () => {
  assert.equal(configureWebpack({ mode: 'development' }, false), undefined);
  assert.equal(configureWebpack(production, true), undefined);
});

test('双语生成文档和逐页元数据进入同一组，手写文档保留原分块', () => {
  const { apiDocs } = configureWebpack(production, false).optimization.splitChunks.cacheGroups;
  const paths = [
    '/site/docs/api/rxdb/classes/Repository.md',
    '/site/i18n/en/docusaurus-plugin-content-docs/current/api/rxdb/classes/Repository.md',
    '/site/.docusaurus/docusaurus-plugin-content-docs/default/site-docs-api-rxdb-classes-repository-md-7e1.json',
    '/site/.docusaurus/docusaurus-plugin-content-docs/default/site-i-18-n-en-docusaurus-plugin-content-docs-current-api-rxdb-classes-repository-md-7e1.json'
  ];
  for (const path of paths) {
    assert.equal(apiDocs.test({ nameForCondition: () => path }), true, path);
    assert.equal(apiDocs.test({ nameForCondition: () => path.replaceAll('/', '\\') }), true, path);
  }
  assert.equal(apiDocs.test({ nameForCondition: () => '/site/docs/guides/start.mdx' }), false);
  assert.equal(apiDocs.test({ nameForCondition: () => undefined }), false);
  assert.equal(apiDocs.chunks({ name: 'ab123456' }), true);
  assert.equal(apiDocs.chunks({ name: 'main' }), false);
  assert.equal(apiDocs.name(null, [{ name: 'ab123456' }]), 'api-docs-ab');
  assert.equal(apiDocs.name(null, [{ name: 'ab654321' }]), 'api-docs-ab');
});
