import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  allowedPublicRequest,
  parsePublicBuild,
  publicSmokeSettings,
  readPublicBuild
} from './public-origin-smoke.mjs';

const origin = 'https://media.aiao.io';
const env = {
  AIAO_MEDIA_SMOKE_ORIGIN: origin,
  AIAO_MEDIA_SMOKE_RELEASE: 'deaaa727-7f52-4da2-9da5-fe33088cd244',
  AIAO_MEDIA_SMOKE_MANIFEST_SHA256: 'a'.repeat(64)
};

test('正式烟测必须绑定审核过的发布版本和产物摘要，不读取供应商凭据', () => {
  const settings = publicSmokeSettings({ ...env, AIAO_IMAGE_API_KEY: 'private-key' });
  assert.equal(settings.origin, origin);
  assert.equal(settings.manifestSha256, 'a'.repeat(64));
  assert.ok(!JSON.stringify(settings).includes('private-key'));
  for (const field of ['AIAO_MEDIA_SMOKE_RELEASE', 'AIAO_MEDIA_SMOKE_MANIFEST_SHA256'])
    assert.throws(() => publicSmokeSettings({ ...env, [field]: '' }));
  for (const value of ['http://media.aiao.io', 'https://other.example.test', `${origin}/?key=x`])
    assert.throws(() => publicSmokeSettings({ ...env, AIAO_MEDIA_SMOKE_ORIGIN: value }));
  assert.throws(() => publicSmokeSettings({ ...env, DEBUG: 'pw:api' }));
});

test('网络边界拒绝生成、探针、远程写入和外站，不制造成功响应', () => {
  for (const path of ['/', '/create', '/offline-worker.js', '/api/templates', '/api/provider-policies'])
    assert.equal(allowedPublicRequest(origin, `${origin}${path}`, 'GET'), true);
  for (const path of [
    '/api/relay',
    '/api/provider-probe',
    '/api/platform/catalog',
    '/api/platform/account',
    '/images/generations',
    '/auth/v1/token'
  ])
    for (const method of ['GET', 'POST']) assert.equal(allowedPublicRequest(origin, `${origin}${path}`, method), false);
  assert.equal(allowedPublicRequest(origin, `${origin}/api/templates`, 'POST'), false);
  assert.equal(allowedPublicRequest(origin, 'https://provider.example.test/v1/images/generations', 'POST'), false);
  assert.equal(allowedPublicRequest(origin, 'https://other.example.test/image.png', 'GET'), false);
});

test('安装状态只允许同源读取，不允许初始化写入或扩大到管理接口', () => {
  for (const method of ['GET', 'HEAD'])
    assert.equal(allowedPublicRequest(origin, `${origin}/api/installation`, method), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
    assert.equal(allowedPublicRequest(origin, `${origin}/api/installation`, method), false);
  for (const path of ['/api/installation/reset', '/api/admin/session'])
    assert.equal(allowedPublicRequest(origin, `${origin}${path}`, 'GET'), false);
  assert.equal(allowedPublicRequest(origin, 'https://other.example.test/api/installation', 'GET'), false);
});

test('公开产物支持本机模式和有效平台配置，配置必须匹配审核过的清单摘要', async () => {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const files = new Map();
  const server = createServer((incoming, outgoing) => {
    const bytes = files.get(incoming.url);
    outgoing.writeHead(bytes ? 200 : 404).end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { origin: `http://127.0.0.1:${server.address().port}` };
  function prepare(
    config,
    source = `globalThis.__AIAO_SUPABASE_CONFIG__ = ${JSON.stringify(config)};\n`,
    includeConfig = true
  ) {
    const bytes = Buffer.from(source);
    const assets = [
      { path: '/offline-shell.html', size: 42, sha256: 'c'.repeat(64) },
      { path: '/app-config.js', size: bytes.length, sha256: hash(bytes) }
    ].filter(asset => includeConfig || asset.path !== '/app-config.js');
    const template = "self.addEventListener('install', () => {});";
    const version = hash(JSON.stringify(assets) + template);
    const manifest = Buffer.from(JSON.stringify({ version }));
    files.set('/offline-manifest.json', manifest);
    files.set(
      '/offline-worker.js',
      Buffer.from(`const MANIFEST = ${JSON.stringify({ version, assets })};\n${template}`)
    );
    files.set('/app-config.js', bytes);
    settings.manifestSha256 = hash(manifest);
  }
  try {
    for (const config of [
      null,
      { url: 'https://platform.supabase.co', anonKey: 'sb_publishable_fixture' },
      { url: 'http://127.0.0.1:54321', anonKey: `e30.${Buffer.from('{"role":"anon"}').toString('base64url')}.c2ln` }
    ]) {
      prepare(config);
      assert.deepEqual((await readPublicBuild(settings)).accountConfig, config);
      files.set('/app-config.js', Buffer.from('globalThis.__AIAO_SUPABASE_CONFIG__ = null;\n// changed'));
      await assert.rejects(readPublicBuild(settings), /SMOKE_ACCOUNT_CONFIG_CHANGED/);
    }
    for (const config of [
      {},
      { url: 'https://platform.supabase.co', anonKey: 'sb_secret_private' },
      { url: 'https://platform.supabase.co', anonKey: 'sb_publishable_fixture', serviceRoleKey: 'private' }
    ]) {
      prepare(config);
      await assert.rejects(readPublicBuild(settings), /SMOKE_ACCOUNT_CONFIG_INVALID/);
    }
    prepare(null, 'globalThis.__AIAO_SUPABASE_CONFIG__ = null; globalThis.extra = true;');
    await assert.rejects(readPublicBuild(settings), /SMOKE_ACCOUNT_CONFIG_INVALID/);
    prepare(null, undefined, false);
    await assert.rejects(readPublicBuild(settings), /SMOKE_ACCOUNT_CONFIG_CHANGED/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('只接受匹配摘要和离线壳的嵌入清单，拒绝产物中途更换或越界资源', () => {
  const assets = [{ path: '/offline-shell.html', size: 42, sha256: 'c'.repeat(64) }];
  const template = "self.addEventListener('install', () => {});";
  const embedded = {
    version: createHash('sha256')
      .update(JSON.stringify(assets) + template)
      .digest('hex'),
    assets
  };
  const manifest = Buffer.from(JSON.stringify({ version: embedded.version }));
  const sha256 = createHash('sha256').update(manifest).digest('hex');
  const worker = value => Buffer.from(`const MANIFEST = ${JSON.stringify(value)};\n${template}`);
  assert.deepEqual(parsePublicBuild(manifest, worker(embedded), sha256), embedded);
  assert.throws(() => parsePublicBuild(manifest, worker(embedded), 'd'.repeat(64)));
  assert.throws(() => parsePublicBuild(manifest, worker({ ...embedded, version: 'e'.repeat(64) }), sha256));
  assert.throws(() => parsePublicBuild(manifest, worker({ ...embedded, assets: [] }), sha256));
  assert.throws(() =>
    parsePublicBuild(manifest, worker({ ...embedded, assets: [{ ...assets[0], size: 43 }] }), sha256)
  );
  assert.throws(() => parsePublicBuild(manifest, Buffer.concat([worker(embedded), Buffer.from('changed')]), sha256));
  assert.throws(() =>
    parsePublicBuild(manifest, worker({ ...embedded, assets: [{ ...embedded.assets[0], path: '/api/relay' }] }), sha256)
  );
  assert.throws(() =>
    parsePublicBuild(
      manifest,
      worker({ ...embedded, assets: [{ ...embedded.assets[0], path: '/api/templates' }] }),
      sha256
    )
  );
  assert.throws(() =>
    parsePublicBuild(
      manifest,
      worker({ ...embedded, assets: [{ ...embedded.assets[0], path: '/../private' }] }),
      sha256
    )
  );
});
