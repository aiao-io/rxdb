import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkDist, listDistFiles, parseHeadersFile } from './dist-check.mjs';

const REQUIRED = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};
const GOOD_HEADERS = '/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-dist-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

test('parseHeadersFile 按规则分组，忽略注释与空行，头名保持原样', () => {
  const rules = parseHeadersFile(
    [
      '# 说明',
      '/*',
      '  Cross-Origin-Opener-Policy: same-origin',
      '',
      '/assets/*',
      '  Cache-Control: public, max-age=60'
    ].join('\n')
  );
  assert.deepEqual([...rules.keys()], ['/*', '/assets/*']);
  assert.deepEqual(rules.get('/*'), [{ name: 'Cross-Origin-Opener-Policy', value: 'same-origin' }]);
  assert.deepEqual(rules.get('/assets/*'), [{ name: 'Cache-Control', value: 'public, max-age=60' }]);
});

test('parseHeadersFile 的值里可以有冒号', () => {
  const rules = parseHeadersFile('/*\n  Link: <https://a.example/x>; rel=preload\n');
  assert.deepEqual(rules.get('/*'), [{ name: 'Link', value: '<https://a.example/x>; rel=preload' }]);
});

test('parseHeadersFile 遇到没有规则的响应头时报错，不悄悄丢弃', () => {
  assert.throws(() => parseHeadersFile('  Cross-Origin-Opener-Policy: same-origin\n'), /没有归属的规则/);
});

test('listDistFiles 返回排序后的相对路径与大小', async t => {
  const root = await fixture(t, { 'index.html': 'abc', 'assets/b.js': 'bb', 'assets/a.js': 'a' });
  assert.deepEqual(await listDistFiles(root), [
    { path: 'assets/a.js', size: 1 },
    { path: 'assets/b.js', size: 2 },
    { path: 'index.html', size: 3 }
  ]);
});

test('产物合格时没有问题', async t => {
  const distDir = await fixture(t, { 'index.html': '<app-root></app-root>', _headers: GOOD_HEADERS, 'main.js': 'x' });
  const { files, problems } = await checkDist({ distDir, requiredHeaders: REQUIRED });
  assert.deepEqual(problems, []);
  assert.equal(files.length, 3);
});

test('产物目录不存在时提示先构建', async t => {
  const root = await fixture(t, {});
  const { problems } = await checkDist({ distDir: path.join(root, 'missing'), requiredHeaders: REQUIRED });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /先构建 aiao-desktop-web/);
});

test('缺 index.html 或缺 _headers 都报', async t => {
  const distDir = await fixture(t, { 'main.js': 'x' });
  const { problems } = await checkDist({ distDir, requiredHeaders: REQUIRED });
  assert.ok(problems.some(item => item.includes('index.html')));
  assert.ok(problems.some(item => item.includes('_headers')));
});

test('缺少跨源隔离响应头，或取值不对，指出是哪一个', async t => {
  const missing = await fixture(t, {
    'index.html': 'x',
    _headers: '/*\n  Cross-Origin-Opener-Policy: same-origin\n'
  });
  const wrongValue = await fixture(t, {
    'index.html': 'x',
    _headers: '/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: credentialless\n'
  });
  const first = await checkDist({ distDir: missing, requiredHeaders: REQUIRED });
  const second = await checkDist({ distDir: wrongValue, requiredHeaders: REQUIRED });
  assert.deepEqual(first.problems.length, 1);
  assert.match(first.problems[0], /Cross-Origin-Embedder-Policy/);
  assert.deepEqual(second.problems.length, 1);
  assert.match(second.problems[0], /Cross-Origin-Embedder-Policy.*require-corp/);
});

test('同一个响应头写了多次会被 Pages 拼成无效值，要报', async t => {
  const distDir = await fixture(t, {
    'index.html': 'x',
    _headers: `${GOOD_HEADERS}\n/assets/*\n  Cross-Origin-Embedder-Policy: require-corp\n`
  });
  const { problems } = await checkDist({ distDir, requiredHeaders: REQUIRED });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Cross-Origin-Embedder-Policy.*2 次/);
});

test('响应头只写在 /* 以外的规则里，不算全站生效', async t => {
  const distDir = await fixture(t, {
    'index.html': 'x',
    _headers: '/assets/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n'
  });
  const { problems } = await checkDist({ distDir, requiredHeaders: REQUIRED });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /\/\*/);
});
