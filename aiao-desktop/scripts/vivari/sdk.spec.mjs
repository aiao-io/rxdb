import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@vivari/core/package.json'));

test('SDK 将宿主同源 vendor 请求交回浏览器，其他 localhost 请求仍进入虚拟机', async () => {
  const worker = await readFile(join(root, 'dist/assets/process-worker-CEpIMzRj.js'), 'utf8');
  const start = worker.indexOf('function isHostVendorRequest(input, location) {');
  assert.notEqual(start, -1, '需要安装受版本约束的 Vivari 资源路由补丁');
  const end = worker.indexOf('\n}', start) + 2;
  const route = runInNewContext(`(${worker.slice(start, end)})`, { URL });
  const location = new URL('http://127.0.0.1:4410/assets/process-worker.js');
  for (const input of [
    location.origin + '/vendor/pyodide/python_stdlib.zip',
    new URL(location.origin + '/vendor/ruff/ruff_wasm.js'),
    new Request(location.origin + '/vendor/sqlite/sqlite3.wasm')
  ])
    assert.equal(route(input, location), true);
  for (const input of [
    'http://127.0.0.1:3000/vendor/example',
    location.origin + '/api',
    'https://example.test/vendor/test',
    'invalid://',
    null
  ])
    assert.equal(route(input, location), false);
  assert.equal(route('/vendor/test', undefined), false);
  assert.match(
    worker,
    /!isHostVendorRequest\(input, HOST_REALM\.held\.get\("location"\)\) && loopbackFetch\.route\(input\)/
  );
});

test('Ruff 使用宿主 ESM 加载器，修补后的两个 worker URL 都区分旧缓存', async () => {
  const kernel = await readFile(join(root, 'dist/assets/kernel-worker-B2lyfcKA.js'), 'utf8');
  const worker = await readFile(join(root, 'dist/assets/process-worker-CEpIMzRj.js'), 'utf8');
  const entry = await readFile(join(root, 'dist/index.js'), 'utf8');
  assert.match(kernel, /globalThis\.__ocImportHost\(base \+ 'ruff_wasm.js'\)/);
  assert.match(worker, /globalThis\.__ocImportHost = \(spec\) => trackHost\(import\(spec\)\)/);
  assert.match(entry, /kernel-worker-B2lyfcKA\.js\?aiao-runtime=3/);
  assert.match(kernel, /process-worker-CEpIMzRj\.js\?aiao-runtime=3/);
});

test('pip 的 wheel 加载失败必须返回失败，不能打印安装成功或保存空包存储', async () => {
  const worker = await readFile(join(root, 'dist/assets/process-worker-CEpIMzRj.js'), 'utf8');
  const start = worker.indexOf('async function pipInstall(indexUrl, names) {');
  const end = worker.indexOf('\n\tasync function pipList(', start);
  const stdout = [];
  const stderr = [];
  const install = runInNewContext(`(${worker.slice(start, end).trim()})`, {
    pipSession: async () => ({
      pyodide: {
        loadPackage: async (names, options) => {
          if (Array.isArray(names)) options.errorCallback('wheel HTTP 404');
          return [];
        },
        pyimport: () => ({
          install: async () => {
            throw new Error('wheel HTTP 404');
          }
        })
      },
      cwd: '/project',
      env: { sitePackages: '/site' },
      restore: { state: 'absent' }
    }),
    walkPyodide: () => new Map(),
    loaderToStderr: {},
    loaderToStdout: {},
    process: { stdout: { write: text => stdout.push(text) }, stderr: { write: text => stderr.push(text) } }
  });
  assert.equal(await install('http://example.test/vendor/pyodide/', ['missing.whl']), 1);
  assert.equal(stdout.length, 0);
  assert.match(stderr.join(''), /could not install.*404/);
});
