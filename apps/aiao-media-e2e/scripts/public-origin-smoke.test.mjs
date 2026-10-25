import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { allowedPublicRequest, parsePublicBuild, publicSmokeSettings } from './public-origin-smoke.mjs';

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
  for (const path of ['/api/relay', '/api/provider-probe', '/images/generations', '/auth/v1/token'])
    for (const method of ['GET', 'POST']) assert.equal(allowedPublicRequest(origin, `${origin}${path}`, method), false);
  assert.equal(allowedPublicRequest(origin, `${origin}/api/templates`, 'POST'), false);
  assert.equal(allowedPublicRequest(origin, 'https://provider.example.test/v1/images/generations', 'POST'), false);
  assert.equal(allowedPublicRequest(origin, 'https://other.example.test/image.png', 'GET'), false);
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
