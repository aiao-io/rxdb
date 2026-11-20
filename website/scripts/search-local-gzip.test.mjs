import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const pluginRoot = path.dirname(require.resolve('@easyops-cn/docusaurus-search-local'));
const { postBuildFactory } = require(path.join(pluginRoot, 'utils/postBuildFactory.js'));
const { generate } = require(path.join(pluginRoot, 'utils/generate.js'));

async function searchWorker(filename, fetchIndex) {
  const workerPath = path.resolve(pluginRoot, '../../client/client/theme/worker.js');
  const bundled = await build({
    entryPoints: [workerPath],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    plugins: [
      {
        name: 'worker-test-environment',
        setup(builder) {
          builder.onResolve({ filter: /proxiedGeneratedConstants|^comlink$/ }, args => ({
            path: args.path,
            namespace: 'test'
          }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, args => ({
            contents:
              args.path === 'comlink' ?
                'export function expose() {}'
              : `export const language = ['en']; export const removeDefaultStopWordFilter = []; export const fuzzyMatchingDistance = 1; export const searchIndexUrl = ${JSON.stringify(filename)};`
          }));
        }
      }
    ]
  });
  const module = { exports: {} };
  runInNewContext(bundled.outputFiles[0].text, {
    module,
    exports: module.exports,
    fetch: fetchIndex,
    Response,
    DecompressionStream,
    URL,
    location: { origin: 'https://preview.example' }
  });
  return new module.exports.SearchWorker();
}

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
  const worker = await searchWorker(filename, async url => {
    assert.equal(url, `/${filename}`);
    return new Response(compressed);
  });
  const results = await worker.search('/', '', 'transaction', 10);
  assert.ok(results.some(result => result.document.t.includes('transaction persistence')));
});

test('真实搜索 worker 在索引请求失败时明确报错', async () => {
  const worker = await searchWorker('search-index.json.gz', async () => new Response('', { status: 404 }));
  await assert.rejects(worker.fetchIndexes('/', ''), /Search index request failed: 404/);
});

test('真实搜索 worker 拒绝损坏的 gzip 内容', async () => {
  const worker = await searchWorker('search-index.json.gz', async () => new Response('not gzip'));
  await assert.rejects(worker.fetchIndexes('/', ''));
});
