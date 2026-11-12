import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findSecrets } from './check-web-secrets.mjs';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-web-secrets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

test('产物里没有密钥时不报', async t => {
  const root = await fixture(t, {
    'dist/main.js': 'const apiUrl = "http://localhost:8030"; fetch("/api/agent/session");'
  });
  assert.deepEqual(await findSecrets({ distDir: path.join(root, 'dist'), envFiles: [] }), []);
});

test('出现 Trigger.dev 密钥或供应商密钥形状的字符串时报出文件与类型', async t => {
  const root = await fixture(t, {
    'dist/chunk-a.js': 'const key = "tr_prod_abcdefghijklmnop1234";',
    'dist/chunk-b.js': 'headers.authorization = "Bearer sk-ant-api03-abcdefghijklmnopqrstuv";'
  });
  const findings = await findSecrets({ distDir: path.join(root, 'dist'), envFiles: [] });
  assert.deepEqual(
    findings.map(item => `${item.file} ${item.kind}`),
    ['chunk-a.js Trigger.dev 密钥', 'chunk-b.js 供应商 API 密钥']
  );
});

test('本机环境文件里的密钥值出现在产物里时报出变量名，不回显取值', async t => {
  const root = await fixture(t, {
    'dist/main.js': 'const leaked = "relay-key-0123456789abcdef";',
    'api/.dev.vars': 'SUPABASE_URL="https://example.supabase.co"\nDEEPSEEK_API_KEY="relay-key-0123456789abcdef"\n'
  });
  const findings = await findSecrets({
    distDir: path.join(root, 'dist'),
    envFiles: [path.join(root, 'api/.dev.vars')]
  });
  assert.deepEqual(findings, [{ file: 'main.js', kind: '环境变量 DEEPSEEK_API_KEY 的取值' }]);
  assert.ok(!JSON.stringify(findings).includes('relay-key'));
});

test('不存在的环境文件与二进制文件跳过', async t => {
  const root = await fixture(t, {
    'dist/sqlite.wasm': 'tr_prod_abcdefghijklmnop1234',
    'dist/index.html': '<app-root></app-root>'
  });
  assert.deepEqual(
    await findSecrets({ distDir: path.join(root, 'dist'), envFiles: [path.join(root, 'missing/.env')] }),
    []
  );
});
