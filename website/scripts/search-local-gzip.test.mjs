import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const pluginRoot = path.dirname(require.resolve('@easyops-cn/docusaurus-search-local'));
const { postBuildFactory } = require(path.join(pluginRoot, 'utils/postBuildFactory.js'));
const { generate } = require(path.join(pluginRoot, 'utils/generate.js'));

test('搜索索引以 gzip 发布，浏览器解压后仍保留全文与可加载的索引', async t => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'rxdb-search-gzip-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await mkdir(path.join(outDir, 'docs'));
  await writeFile(
    path.join(outDir, 'docs/guide.html'),
    '<article><h1>Reactive database</h1><p>transaction persistence</p></article>'
  );
  const options = {
    language: ['en'],
    removeDefaultStopWordFilter: [],
    indexDocs: true,
    docsRouteBasePath: ['docs'],
    hashed: false
  };
  const filename = generate(options, outDir).replace('{dir}', '');
  assert.match(filename, /\.json\.gz$/);
  await postBuildFactory(
    options,
    filename
  )({
    outDir,
    baseUrl: '/',
    routesPaths: ['/docs/guide'],
    siteConfig: { trailingSlash: false }
  });
  const compressed = await readFile(path.join(outDir, filename));
  const body = new Response(compressed).body.pipeThrough(new DecompressionStream('gzip'));
  const indexes = await new Response(body).json();
  assert.ok(indexes.flatMap(entry => entry.documents).some(doc => doc.t.includes('transaction persistence')));
  const lunr = require(require.resolve('lunr', { paths: [pluginRoot] }));
  assert.ok(indexes.some(entry => lunr.Index.load(entry.index).search('transaction').length > 0));
  const worker = await readFile(path.resolve(pluginRoot, '../../client/client/theme/worker.js'), 'utf8');
  assert.match(worker, /DecompressionStream\(['"]gzip['"]\)/);
});
