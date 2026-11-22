import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
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
  assert.match(entry, /kernel-worker-B2lyfcKA\.js\?aiao-runtime=4/);
  assert.match(kernel, /process-worker-CEpIMzRj\.js\?aiao-runtime=4/);
});

test('交互 shell 使用通用启动提示，不暴露 Vivari 品牌', async () => {
  const kernel = await readFile(join(root, 'dist/assets/kernel-worker-B2lyfcKA.js'), 'utf8');
  assert.equal(kernel.includes('Local shell — type commands, Enter to run.'), true);
  assert.equal(kernel.includes('Vivari shell — type commands, Enter to run.'), false);
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

test('Python input 按完整行读取分块按键，保留空行、退格与 EOF 前的内容', async () => {
  const worker = await readFile(join(root, 'dist/assets/process-worker-CEpIMzRj.js'), 'utf8');
  const readerStart = worker.indexOf('function makeLineReader(read, echo) {');
  const readerEnd = worker.indexOf('\n/**', readerStart);
  const installStart = worker.indexOf('function installStdin(pyodide, readStdin) {');
  const installEnd = worker.indexOf('\nfunction installBlockingPatch(', installStart);
  const echo = [];
  const install = runInNewContext(
    `${worker.slice(readerStart, readerEnd)}\n${worker.slice(installStart, installEnd)}\ninstallStdin;`,
    {
      process: { env: { VV_TTY: '1' }, stderr: { write: text => echo.push(text) } }
    }
  );
  const chunks = ['a', 'i', '\x7f', 'iao\r', '\nnext\n\npartial', null];
  let options;
  assert.equal(
    install({ setStdin: value => (options = value) }, () => chunks.shift()),
    true
  );
  assert.deepEqual(
    Array.from({ length: 5 }, () => options.stdin()),
    ['aiao', 'next', '', 'partial', null]
  );
  assert.equal(echo.join('').includes('\b \b'), true);
});

test('Python REPL 复用脚本会话的项目目录、包存储和文件回写', async () => {
  const worker = await readFile(join(root, 'dist/assets/process-worker-CEpIMzRj.js'), 'utf8');
  const start = worker.indexOf('function repl(indexUrl) {');
  const end = worker.indexOf('\n\tasync function ensurePackages(', start);
  const calls = [];
  const drive = () => undefined;
  const repl = runInNewContext(`(${worker.slice(start, end).trim()})`, {
    process: { cwd: () => '/project' },
    driveRepl: drive,
    runSource: async (...args) => {
      calls.push(args);
      return 7;
    }
  });
  assert.equal(await repl('http://example.test/vendor/pyodide/'), 7);
  assert.equal(calls.length, 1);
  const [indexUrl, source, options] = calls[0];
  assert.equal(indexUrl, 'http://example.test/vendor/pyodide/');
  assert.equal(source, '');
  assert.equal(options.cwd, '/project');
  assert.equal(options.filename, '<stdin>');
  assert.deepEqual(Array.from(options.argv), ['']);
  assert.equal(options.drive, drive);
});

test('Bun eval 从项目目录解析已安装的依赖、相对模块与 require.resolve', async () => {
  const kernel = await readFile(join(root, 'dist/assets/kernel-worker-B2lyfcKA.js'), 'utf8');
  const start = kernel.indexOf('const BUN_PROGRAM = `');
  const end = kernel.indexOf('\nconst BUNX_PROGRAM =', start);
  const source = runInNewContext(`${kernel.slice(start, end)}\nBUN_PROGRAM;`, {
    REPL_KIT_SRC: '',
    WATCH_KIT_SRC: ''
  });
  const project = await realpath(await mkdtemp(join(tmpdir(), 'aiao-bun-eval-')));
  try {
    const dependency = join(project, 'node_modules/aiao-bun-smoke');
    await mkdir(dependency, { recursive: true });
    await writeFile(join(dependency, 'index.js'), 'module.exports = 42;');
    await writeFile(join(project, 'local.cjs'), 'module.exports = "LOCAL_OK";');
    const output = [];
    const errors = [];
    const exits = [];
    await runInNewContext(source, {
      require,
      console: { log: (...args) => output.push(args) },
      process: {
        argv: [
          'bun',
          '/bin/bun.js',
          '-e',
          'console.log(require("aiao-bun-smoke"), require("./local.cjs"), require.resolve("aiao-bun-smoke"))'
        ],
        cwd: () => project,
        env: {},
        stdout: { write: () => undefined },
        stderr: { write: text => errors.push(text) },
        exit: code => {
          exits.push(code);
          throw Object.assign(new Error(`exit ${code}`), { __processExit: code });
        }
      }
    });
    assert.deepEqual(output, [[42, 'LOCAL_OK', join(dependency, 'index.js')]]);
    assert.deepEqual(exits, [0]);
    assert.deepEqual(errors, []);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
