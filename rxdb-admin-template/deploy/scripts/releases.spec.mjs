import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { ensureEnvFile, formatEnv, generateSecrets, loadEnv, secretNames } from './lib/env.mjs';
import {
  appendRecord,
  linkedRelease,
  pointToRelease,
  previousRelease,
  pruneReleases,
  readRecords,
  releaseId,
  releasePattern,
  removeLink,
  treeDigest
} from './lib/releases.mjs';

/** 发布目录、原子切换与发布记录（ADMIN-US-217 AC#2 / AC#8），以及 `.env.local` 的生成（AC#3）。 */
const roots = [];
async function sandbox() {
  const root = await mkdtemp(path.join(tmpdir(), 'admin-releases-'));
  roots.push(root);
  await mkdir(path.join(root, 'releases'), { recursive: true });
  return root;
}
after(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })));
});
const ids = ['r20261118-010000-aaaaaaa', 'r20261118-020000-bbbbbbb', 'r20261118-030000-ccccccc'];
async function release(root, id) {
  await mkdir(path.join(root, 'releases', id, 'web', 'react'), { recursive: true });
  await mkdir(path.join(root, 'releases', id, 'functions'), { recursive: true });
  await writeFile(path.join(root, 'releases', id, 'web', 'react', 'index.html'), `<html>${id}</html>`);
}

describe('发布 ID 与目录', () => {
  it('发布 ID 由 UTC 时刻与提交前 7 位组成，按字典序即按时间排序', () => {
    const first = releaseId(new Date('2026-11-18T01:02:03Z'), '76b5e2c9e00000');
    assert.equal(first, 'r20261118-010203-76b5e2c');
    assert.match(first, releasePattern);
    assert.ok(releaseId(new Date('2026-11-18T10:00:00Z'), 'aaaaaaa') > first);
  });
  it('原子切换：链接从旧发布直接换到新发布，读者看到的始终是完整的某一个版本；函数链接指向发布里的函数目录', async () => {
    const root = await sandbox();
    for (const id of ids) await release(root, id);
    assert.equal(await linkedRelease(root, 'current'), null);
    await pointToRelease(root, 'current', ids[0]);
    assert.equal(await readlink(path.join(root, 'current')), `releases/${ids[0]}`);
    assert.equal(
      await readFile(path.join(root, 'current', 'web', 'react', 'index.html'), 'utf8'),
      `<html>${ids[0]}</html>`
    );
    await pointToRelease(root, 'current', ids[1]);
    assert.equal(await linkedRelease(root, 'current'), ids[1]);
    assert.equal(
      await readFile(path.join(root, 'current', 'web', 'react', 'index.html'), 'utf8'),
      `<html>${ids[1]}</html>`
    );
    await pointToRelease(root, 'functions', ids[1]);
    assert.equal(await readlink(path.join(root, 'functions')), `releases/${ids[1]}/functions`);
    assert.equal(await linkedRelease(root, 'functions'), ids[1]);
    await assert.rejects(pointToRelease(root, 'current', '../etc'), /格式不对/);
    // 临时链接不留在目录里
    assert.deepEqual(
      (await import('node:fs/promises').then(fs => fs.readdir(root))).filter(name => name.startsWith('.')),
      []
    );
    await removeLink(root, 'staged');
    await pointToRelease(root, 'staged', ids[2]);
    await removeLink(root, 'staged');
    assert.equal(await linkedRelease(root, 'staged'), null);
    // 只删链接，不删它指向的发布
    assert.ok((await stat(path.join(root, 'releases', ids[2]))).isDirectory());
    await assert.rejects(removeLink(root, 'releases'), /不是符号链接/);
  });
  it('目录摘要覆盖相对路径与内容：内容或文件名一变摘要就变', async () => {
    const root = await sandbox();
    await release(root, ids[0]);
    const tree = path.join(root, 'releases', ids[0], 'web');
    const first = await treeDigest(tree);
    assert.equal(first.files, 1);
    await writeFile(path.join(tree, 'react', 'index.html'), '<html>changed</html>');
    assert.notEqual((await treeDigest(tree)).sha256, first.sha256);
  });
  it('清理旧发布：失败的发布全部删除，上线过的保留最近的若干个，受保护的无论多旧都保留', async () => {
    const root = await sandbox();
    const failed = 'r20261118-040000-ddddddd';
    for (const id of [...ids, failed]) await release(root, id);
    const removed = await pruneReleases(path.join(root, 'releases'), {
      keep: 1,
      released: ids,
      protect: [ids[0], null]
    });
    assert.deepEqual(removed, [ids[1], failed]);
    assert.ok((await stat(path.join(root, 'releases', ids[0]))).isDirectory());
    assert.ok((await stat(path.join(root, 'releases', ids[2]))).isDirectory());
  });
});

describe('发布记录与回滚目标', () => {
  it('记录逐行追加；回滚目标是当前之前最近一次上线的发布，失败的发布不算', async () => {
    const root = await sandbox();
    const file = path.join(root, 'deployments.jsonl');
    assert.deepEqual(await readRecords(file), []);
    const records = [
      { release: ids[0], result: 'released' },
      { release: ids[1], result: 'failed', failedStep: 7 },
      { release: ids[2], result: 'released' }
    ];
    for (const record of records) await appendRecord(file, record);
    assert.deepEqual(await readRecords(file), records);
    assert.equal(previousRelease(records, ids[2]), ids[0]);
    assert.equal(previousRelease([...records, { result: 'rolled_back', from: ids[2], to: ids[0] }], ids[0]), ids[2]);
    assert.equal(previousRelease([{ release: ids[0], result: 'released' }], ids[0]), null);
  });
});

describe('部署环境的密钥（AC#3）', () => {
  it('生成的密钥齐全且各不相同；JSON 值写成单引号，读回来与原值一致', async () => {
    const root = await sandbox();
    const file = path.join(root, '.env.local');
    assert.equal(await ensureEnvFile(file), true);
    // 已存在时不覆盖
    const before = await readFile(file, 'utf8');
    assert.equal(await ensureEnvFile(file), false);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const env = await loadEnv(file);
    for (const name of secretNames) assert.ok(env[name], name);
    assert.equal(new Set(secretNames.map(name => env[name])).size, secretNames.length);
    const jwks = JSON.parse(env.JWT_JWKS);
    assert.deepEqual(
      jwks.keys.map(key => [key.kty, key.alg]),
      [
        ['EC', 'ES256'],
        ['oct', 'HS256']
      ]
    );
    // 公开的 JWKS 里没有私钥分量；私钥只在 GoTrue 的 JWT_KEYS 里
    assert.equal(jwks.keys[0].d, undefined);
    assert.ok(JSON.parse(env.JWT_KEYS)[0].d);
    assert.equal(env.REALTIME_DB_ENC_KEY.length, 16);
    for (const name of ['POSTGRES_PASSWORD', 'ADMIN_SERVICE_PASSWORD']) assert.match(env[name], /^[0-9a-f]{48}$/);
    const roles = ['ANON_KEY', 'SERVICE_ROLE_KEY'].map(
      name => JSON.parse(Buffer.from(env[name].split('.')[1], 'base64url').toString()).role
    );
    assert.deepEqual(roles, ['anon', 'service_role']);
  });
  it('缺少任何一项时报出变量名（不报值）', async () => {
    const root = await sandbox();
    const file = path.join(root, '.env.local');
    const values = generateSecrets();
    delete values.ADMIN_SERVICE_PASSWORD;
    await writeFile(file, formatEnv(values));
    await assert.rejects(loadEnv(file), /缺少 ADMIN_SERVICE_PASSWORD/);
    await assert.rejects(loadEnv(path.join(root, 'missing')), /local-up/);
  });
});
