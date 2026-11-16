import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareRuntimes, runtimeProblems } from './runtimes.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const asset = { path: 'pyodide/pyodide.asm.wasm', sha256: sha256(wasm) };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'aiao-python-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, outputDir: join(root, 'vendor') };
}

test('首次准备从校验过的发布包复制解释器和 wheel，合格缓存完全离线', async t => {
  const { root, outputDir } = await fixture(t);
  const directory = join(root, 'package');
  await mkdir(directory);
  await writeFile(join(directory, 'python.wasm'), wasm);
  const tarball = join(root, 'package.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', root, 'package']);
  const bytes = await readFile(tarball);
  const archive = {
    name: 'pyodide',
    tarball: 'https://registry.npmjs.org/fixture.tgz',
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    files: [{ ...asset, source: 'python.wasm' }]
  };
  const wheel = Buffer.from('wheel fixture');
  const file = { path: 'pyodide/example.whl', url: 'https://example.test/example.whl', sha256: sha256(wheel) };
  const requested = [];
  const options = { outputDir, archives: [archive], files: [file] };
  await prepareRuntimes({
    ...options,
    fetchAsset: async url => {
      requested.push(url);
      return new Response(url === archive.tarball ? bytes : wheel);
    }
  });
  assert.deepEqual(requested, [archive.tarball, file.url]);
  assert.deepEqual(await readFile(join(outputDir, asset.path)), wasm);
  assert.deepEqual(await readFile(join(outputDir, file.path)), wheel);
  assert.deepEqual(await runtimeProblems(outputDir, [asset, file]), []);
  await prepareRuntimes({
    ...options,
    fetchAsset: () => {
      throw new Error('不得联网');
    }
  });
});

test('缺失、HTML 替身和截断资源必须阻止发布', async t => {
  const { outputDir } = await fixture(t);
  assert.match((await runtimeProblems(outputDir, [asset]))[0], /pyodide.*缺失/);
  await mkdir(join(outputDir, 'pyodide'), { recursive: true });
  await writeFile(join(outputDir, asset.path), '<html>SPA</html>');
  assert.match((await runtimeProblems(outputDir, [asset]))[0], /pyodide.*校验/);
  await assert.rejects(prepareRuntimes({ outputDir, archives: [], files: [asset] }), /校验/);
});

test('wheel 下载失败或散列不符时失败，不留下文件', async t => {
  const { outputDir } = await fixture(t);
  for (const response of [new Response('missing', { status: 404 }), new Response('<html>SPA</html>')]) {
    await assert.rejects(
      prepareRuntimes({
        outputDir,
        archives: [],
        files: [{ ...asset, url: 'https://example.test/runtime' }],
        fetchAsset: async () => response
      }),
      /HTTP 404|校验/
    );
    await assert.rejects(readFile(join(outputDir, asset.path)), { code: 'ENOENT' });
  }
});

test('本地锁文件与版本信息也按固定散列复制', async t => {
  const { outputDir } = await fixture(t);
  const bytes = await readFile(new URL('./ruff-version.txt', import.meta.url));
  const file = { path: 'ruff/version.txt', source: 'ruff-version.txt', sha256: sha256(bytes) };
  await prepareRuntimes({
    outputDir,
    archives: [],
    files: [file],
    fetchAsset: () => {
      throw new Error('不得联网');
    }
  });
  assert.deepEqual(await readFile(join(outputDir, file.path)), bytes);
});

test('Python 锁文件中全部同源 wheel 都有固定资源，传递依赖可解析', async () => {
  const { RUNTIME_ASSETS } = await import('./runtimes.mjs');
  const lock = JSON.parse(await readFile(new URL('./python-lock.json', import.meta.url)));
  const assets = new Map(RUNTIME_ASSETS.map(item => [item.path, item]));
  assert.equal(assets.size, RUNTIME_ASSETS.length);
  for (const pkg of Object.values(lock.packages)) {
    if (pkg.file_name.includes('://')) continue;
    const item = assets.get(`pyodide/${pkg.file_name}`);
    assert.ok(item, `${pkg.name} 的 wheel 缺失`);
    assert.equal(item.sha256, pkg.sha256);
    for (const dependency of pkg.depends) assert.ok(lock.packages[dependency], `${pkg.name} 缺少 ${dependency}`);
  }
  for (const name of [
    'micropip',
    'numpy',
    'pandas',
    'scipy',
    'scikit-learn',
    'pytest',
    'mypy',
    'black',
    'flask',
    'fastapi',
    'uvicorn',
    'gunicorn'
  ])
    assert.ok(assets.has(`pyodide/${lock.packages[name].file_name}`), `${name} 必须同源托管`);
});

test('仓库中的本地运行时资源逐字节符合发布清单的固定散列', async t => {
  const manifest = JSON.parse(await readFile(new URL('./runtimes.json', import.meta.url), 'utf8'));
  const { outputDir } = await fixture(t);
  const files = manifest.files.filter(file => file.source);
  assert.ok(files.length > 0);
  await prepareRuntimes({
    outputDir,
    archives: [],
    files,
    fetchAsset: () => {
      throw new Error('不得联网');
    }
  });
  assert.deepEqual(await runtimeProblems(outputDir, files), []);
});
