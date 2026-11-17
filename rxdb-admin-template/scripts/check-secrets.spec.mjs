import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanArtifacts, scanFiles } from './check-secrets.mjs';

// 假密钥一律在运行时拼出来：本文件被 git 跟踪，`--tracked` 扫描会扫到它自己，
// 字面量写在源码里就会让门禁永远红（也会招来托管平台的密钥扫描告警）。
const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = payload => [base64url({ alg: 'HS256', typ: 'JWT' }), base64url(payload), 'c2lnbmF0dXJl'].join('.');
const serviceJwt = () => jwt({ iss: 'supabase', role: ['service', 'role'].join('_') });
const anonJwt = () => jwt({ iss: 'supabase', role: 'anon' });
const secretKey = () => ['sb', 'secret', 'Q'.repeat(24)].join('_');
const databaseUrl = () => ['postgres', '://admin:', 'hunter2', '@db.example.com:5432/postgres'].join('');
const privateKey = () => ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');

async function fixture(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'admin-secrets-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), content);
  }
  return dir;
}

async function withFixture(files, run) {
  const dir = await fixture(files);
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const rules = findings => findings.map(finding => finding.rule).sort();

test('passes an artifact that only carries the public anon key', async () => {
  await withFixture({ 'assets/main.js': `const key = "${anonJwt()}";` }, async dir => {
    assert.deepEqual(await scanArtifacts([dir]), []);
  });
});

test('flags every kind of server secret value inside an artifact', async () => {
  const files = {
    'a.js': `const key = "${serviceJwt()}";`,
    'b.js': `const key = "${secretKey()}";`,
    'c.js': `const url = "${databaseUrl()}";`,
    'd.js': `const pem = "${privateKey()}";`
  };
  await withFixture(files, async dir => {
    assert.deepEqual(rules(await scanArtifacts([dir])), [
      'database-url',
      'private-key',
      'secret-api-key',
      'service-role-jwt'
    ]);
  });
});

test('flags server-only variable names in artifacts but allows them in tracked source', async () => {
  const content = "const url = process.env['ADMIN_DATABASE_URL'];\n";
  await withFixture({ 'server.js': content }, async dir => {
    assert.deepEqual(rules(await scanArtifacts([dir])), ['server-variable']);
    assert.deepEqual(await scanFiles([path.join(dir, 'server.js')]), []);
  });
});

test('reports file, line and a masked preview without echoing the secret', async () => {
  const secret = secretKey();
  await withFixture({ 'nested/app.js': `first line\nconst key = "${secret}";\n` }, async dir => {
    const [finding] = await scanArtifacts([dir]);
    assert.equal(finding.file, path.join(dir, 'nested/app.js'));
    assert.equal(finding.line, 2);
    assert.ok(!finding.preview.includes(secret), 'preview must not contain the full secret');
    assert.ok(finding.preview.startsWith(secret.slice(0, 6)));
  });
});

test('accepts documented placeholders in connection strings', async () => {
  const placeholder = [
    'postgresql',
    '://postgres.[PROJECT-REF]:',
    '[YOUR-PASSWORD]',
    '@pooler.example.com:6543/postgres'
  ];
  const template = ['postgres', '://admin:', '${PASSWORD}', '@localhost/postgres'];
  await withFixture({ 'README.md': `${placeholder.join('')}\n${template.join('')}\n` }, async dir => {
    assert.deepEqual(await scanFiles([path.join(dir, 'README.md')]), []);
  });
});

test('skips binary files instead of matching inside them', async () => {
  const binary = Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(secretKey())]);
  await withFixture({ 'logo.png': binary }, async dir => {
    assert.deepEqual(await scanArtifacts([dir]), []);
  });
});

test('fails loudly when an artifact directory has not been built', async () => {
  const missing = path.join(os.tmpdir(), `admin-secrets-missing-${process.pid}`);
  await assert.rejects(scanArtifacts([missing]), /产物目录不存在/);
});
