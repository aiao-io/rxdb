import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanBuild } from './check-web-secrets.mjs';

/** 夹具里的密钥在运行时拼出来，源码里不出现完整的密钥形状，免得被推送保护或别的扫描当成真密钥。 */
const FAKE = {
  provider: ['sk', 'proj', 'a1B2c3D4e5F6g7H8i9J0k1L2'].join('-'),
  github: `${'ghp'}_${'a1B2c3D4e5'.repeat(4)}`,
  aws: `${'AKIA'}${'ABCDEFGHIJKLMNOP'}`,
  privateKey: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
  supabase: `${'sb_secret'}_${'a1B2c3D4e5F6g7H8'}`
};

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-web-secrets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

test('产物里没有密钥时不报', async t => {
  const distDir = await fixture(t, {
    'index.html': '<app-root></app-root>',
    'main.js': 'fetch("https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2");',
    'assets/kernel-worker.js': 'const task = "risk-assessment-for-desk-layout";'
  });
  assert.deepEqual(await scanBuild({ distDir }), { filesScanned: 3, findings: [] });
});

test('每类密钥形状都报出文件与类型，不回显取值', async t => {
  const distDir = await fixture(t, {
    'chunk-a.js': `const key = "${FAKE.provider}";`,
    'chunk-b.js': `token = "${FAKE.github}";`,
    'assets/worker.js': `aws = "${FAKE.aws}";`,
    'main.js.map': `"${FAKE.privateKey}\\nMIIE"`,
    'styles.css': `/* ${FAKE.supabase} */`
  });
  const { filesScanned, findings } = await scanBuild({ distDir });
  assert.equal(filesScanned, 5);
  assert.deepEqual(
    findings.map(item => `${item.file} ${item.kind}`),
    [
      'assets/worker.js AWS 访问密钥',
      'chunk-a.js 模型供应商 API 密钥',
      'chunk-b.js GitHub 令牌',
      'main.js.map 私钥',
      'styles.css Supabase 服务端密钥'
    ]
  );
  const report = JSON.stringify(findings);
  for (const value of Object.values(FAKE)) assert.ok(!report.includes(value), '报告不得回显密钥');
});

test('二进制文件不扫描', async t => {
  const distDir = await fixture(t, {
    'favicon.ico': FAKE.provider,
    'assets/runtime.wasm': FAKE.github,
    'index.html': '<app-root></app-root>'
  });
  assert.deepEqual(await scanBuild({ distDir }), { filesScanned: 1, findings: [] });
});

test('产物目录不存在时报错，不当作通过', async t => {
  const root = await fixture(t, {});
  await assert.rejects(scanBuild({ distDir: path.join(root, 'missing') }), { code: 'ENOENT' });
});
