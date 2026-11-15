import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';

import { packDirectory, prepareVendor, validateVendorPack } from './prepare.mjs';

const TOOL = { name: 'npm', version: '10.9.2', entry: 'bin/npm-cli.js', tarball: 'https://registry.npmjs.org/npm/-/npm-10.9.2.tgz' };

async function fixture(t, { version = TOOL.version, entry = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aiao-vivari-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'package');
  await mkdir(join(directory, 'bin'), { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: TOOL.name, version }));
  if (entry) await writeFile(join(directory, TOOL.entry), 'console.log("测试 npm");');
  await writeFile(join(directory, 'binary.dat'), Buffer.from([0, 255, 128]));
  await writeFile(join(directory, 'native.node'), 'native');
  await symlink('package.json', join(directory, 'link'));
  return { root, directory, outputDir: join(root, 'vendor') };
}

function decode(bytes) {
  const raw = gunzipSync(bytes);
  const length = raw.readUInt32LE(0);
  const header = JSON.parse(raw.subarray(4, 4 + length));
  const files = new Map(header.files.map(({ p, o, l }) => [p, raw.subarray(4 + length + o, 4 + length + o + l)]));
  return { version: header.version, files };
}

async function archive(t, options) {
  const fixtureData = await fixture(t, options);
  const path = join(fixtureData.root, 'package.tgz');
  execFileSync('tar', ['-czf', path, '-C', fixtureData.root, 'package']);
  const bytes = await readFile(path);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  return { ...fixtureData, bytes, tool: { ...TOOL, integrity } };
}

test('产物符合 Vivari 的 gzip 索引格式，保留二进制和中文，排除原生扩展与符号链接', async t => {
  const { directory } = await fixture(t);
  const bytes = await packDirectory(directory, TOOL);
  const { version, files } = decode(bytes);
  assert.equal(version, TOOL.version);
  assert.equal(files.get(TOOL.entry).toString(), 'console.log("测试 npm");');
  assert.deepEqual(files.get('binary.dat'), Buffer.from([0, 255, 128]));
  assert.equal(files.has('native.node'), false);
  assert.equal(files.has('link'), false);
  assert.deepEqual(await packDirectory(directory, TOOL), bytes);
  assert.doesNotThrow(() => validateVendorPack(bytes, TOOL));
});

test('包内版本不匹配或缺少 CLI 入口时拒绝打包', async t => {
  const wrong = await fixture(t, { version: '0.0.0' });
  await assert.rejects(packDirectory(wrong.directory, TOOL), /npm.*版本/);
  const missing = await fixture(t, { entry: false });
  await assert.rejects(packDirectory(missing.directory, TOOL), /bin\/npm-cli\.js/);
});

test('损坏的 gzip、错误版本和缺少 CLI 的缓存不能通过校验', async t => {
  assert.throws(() => validateVendorPack(Buffer.from('<html>fallback</html>'), TOOL));
  const { directory } = await fixture(t);
  const bytes = await packDirectory(directory, TOOL);
  assert.throws(() => validateVendorPack(bytes, { ...TOOL, version: '0.0.0' }), /版本/);
  assert.throws(() => validateVendorPack(bytes, { ...TOOL, entry: 'missing.js' }), /missing\.js/);
});

test('首次准备校验下载内容并生成资源，已有合格产物时不联网', async t => {
  const { outputDir, bytes, tool } = await archive(t);
  const requested = [];
  await prepareVendor({ outputDir, tools: [tool], fetchAsset: async url => {
    requested.push(url);
    return new Response(bytes);
  } });
  const installed = await readFile(join(outputDir, 'npm-pack.bin'));
  validateVendorPack(installed, tool);
  assert.deepEqual(requested, [tool.tarball]);
  await prepareVendor({ outputDir, tools: [tool], fetchAsset: () => { throw new Error('不得联网'); } });
  assert.deepEqual(await readFile(join(outputDir, 'npm-pack.bin')), installed);
});

test('下载失败、校验值不符或下载包版本不对时失败，不留下可发布产物', async t => {
  const cases = [
    { response: new Response('missing', { status: 404 }), pattern: /HTTP 404/ },
    { response: new Response('<html>fallback</html>'), pattern: /校验/ },
    { response: null, pattern: /版本/ }
  ];
  for (const scenario of cases) {
    const { outputDir, bytes, tool } = await archive(t, { version: '0.0.0' });
    const response = scenario.response ?? new Response(bytes);
    await assert.rejects(
      prepareVendor({ outputDir, tools: [tool], fetchAsset: async () => response }),
      scenario.pattern
    );
    await assert.rejects(readFile(join(outputDir, 'npm-pack.bin')), { code: 'ENOENT' });
  }
});

test('已有损坏资源直接报错，不能把 HTML 或截断包当作缓存命中', async t => {
  const { outputDir } = await fixture(t);
  await mkdir(outputDir);
  await writeFile(join(outputDir, 'npm-pack.bin'), '<html>fallback</html>');
  await assert.rejects(prepareVendor({ outputDir, tools: [TOOL], fetchAsset: () => { throw new Error('不得联网'); } }));
});

test('缓存索引越界或包名被替换时拒绝使用', async t => {
  const { directory } = await fixture(t);
  const bytes = await packDirectory(directory, TOOL);
  const raw = gunzipSync(bytes);
  const oldLength = raw.readUInt32LE(0);
  const header = JSON.parse(raw.subarray(4, 4 + oldLength));
  header.files[0].o = raw.length;
  const changed = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(changed.length);
  const corrupt = gzipSync(Buffer.concat([length, changed, raw.subarray(4 + oldLength)]));
  assert.throws(() => validateVendorPack(corrupt, TOOL), /索引损坏/);
  assert.throws(() => validateVendorPack(bytes, { ...TOOL, name: 'wrong-name' }), /包信息/);
});

test('tsgo 发布包提取 Go 引擎供 Vivari 使用，缺少引擎结构时拒绝继续', async t => {
  const { root, directory, outputDir } = await fixture(t);
  const tool = { name: 'tsgo', packageName: 'tsgo-wasm', version: '7.0.2', entry: 'tsgo.wasm', entries: ['wasm_exec.cjs'], engine: 'tsgo-wasm', tarball: 'https://example.test/tsgo.tgz' };
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: tool.packageName, version: tool.version }));
  await writeFile(join(directory, tool.entry), Buffer.from([0, 97, 115, 109]));
  const launcher = join(directory, tool.engine);
  const tarball = join(root, 'tsgo.tgz');
  for (const valid of [false, true]) {
    await writeFile(launcher, valid ? 'import x from "node:fs";\nconst encoder = new TextEncoder();\nclass Go {}\nconst go = new Go();\nthrow new Error("不执行启动器");' : 'layout changed');
    execFileSync('tar', ['-czf', tarball, '-C', root, 'package']);
    const bytes = await readFile(tarball);
    const options = { outputDir, tools: [{ ...tool, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` }], fetchAsset: async () => new Response(bytes) };
    if (!valid) {
      await assert.rejects(prepareVendor(options), /Go.*结构/);
      continue;
    }
    await prepareVendor(options);
    const packed = await readFile(join(outputDir, 'tsgo-pack.bin'));
    const engine = decode(packed).files.get('wasm_exec.cjs').toString();
    assert.match(engine, /const fs = globalThis.fs/);
    assert.match(engine, /module.exports = \{ Go \}/);
    assert.doesNotMatch(engine, /import x|new Go\(\)|不执行启动器/);
    validateVendorPack(packed, tool);
    assert.throws(() => validateVendorPack(packed, { ...tool, entries: ['missing.cjs'] }), /missing.cjs/);
  }
});
