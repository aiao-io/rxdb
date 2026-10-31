import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  artifactPair,
  classifyEntryScripts,
  createArtifactServer,
  createUpdateSeed,
  readReleaseArtifact,
  sha256,
  verifyPublishedBuild
} from './actual-release-update.mjs';

async function artifact(root, label) {
  await mkdir(root, { recursive: true });
  const html = `<html><head></head><body><script src="main-${label}.js" type="module"></script></body></html>`;
  const files = {
    '/index.html': html,
    '/offline-shell.html': html,
    '/app-config.js': 'globalThis.__AIAO_SUPABASE_CONFIG__ = null;\n',
    '/nested/resource.js': 'export const value = 1;',
    [`/main-${label}.js`]: `console.log('${label}');`
  };
  const assets = Object.entries(files)
    .filter(([path]) => path !== '/index.html')
    .map(([path, body]) => ({ path, size: Buffer.byteLength(body), sha256: sha256(Buffer.from(body)) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const template = 'self.addEventListener("fetch", () => {});\n';
  const version = sha256(Buffer.from(JSON.stringify(assets) + template));
  files['/offline-worker.js'] = `const MANIFEST = ${JSON.stringify({ version, assets })};\n${template}`;
  files['/offline-manifest.json'] = JSON.stringify({ version });
  files['/_headers'] = '/*\n  X-Content-Type-Options: nosniff\n';
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path.slice(1))), { recursive: true });
    await writeFile(join(root, path.slice(1)), body);
  }
  return root;
}

test('真实产物按原始文件验证内嵌清单、资源摘要与空Auth，不改写任何字节', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-actual-release-'));
  try {
    await artifact(root, 'a');
    const before = await readFile(join(root, 'offline-worker.js'));
    const result = await readReleaseArtifact(root);
    assert.equal(result.version.length, 64);
    assert.equal(result.manifestSha256, sha256(await readFile(join(root, 'offline-manifest.json'))));
    assert.deepEqual(result.entryScripts, ['/main-a.js']);
    assert.deepEqual(result.files.get('/offline-worker.js'), before);
    assert.equal(result.files.get('/nested/resource.js').toString(), 'export const value = 1;');
    assert.deepEqual(await readFile(join(root, 'offline-worker.js')), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('相同manifest不能冒充静态升级，损坏资源、Auth启用和越界资源都拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-actual-release-invalid-'));
  try {
    const a = await readReleaseArtifact(await artifact(join(root, 'a'), 'a'));
    assert.throws(() => artifactPair(a, a), /DISTINCT_STATIC_RELEASES_REQUIRED/);
    await writeFile(join(root, 'a/main-a.js'), 'corrupt');
    await assert.rejects(readReleaseArtifact(join(root, 'a')), /RELEASE_RESOURCE_MISMATCH/);
    await artifact(join(root, 'a'), 'a');
    await writeFile(join(root, 'a/app-config.js'), 'globalThis.__AIAO_SUPABASE_CONFIG__ = {};');
    await assert.rejects(readReleaseArtifact(join(root, 'a')), /LOCAL_ONLY_RELEASE_REQUIRED/);
    await artifact(join(root, 'a'), 'a');
    const worker = await readFile(join(root, 'a/offline-worker.js'), 'utf8');
    await writeFile(join(root, 'a/offline-worker.js'), worker.replace('/main-a.js', '/../main-a.js'));
    await assert.rejects(readReleaseArtifact(join(root, 'a')), /INVALID_RELEASE_ASSET/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('双产物服务仅切换原始目录；无meta注入、线上控制端点或生成请求', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-actual-release-server-'));
  let server;
  try {
    const a = await readReleaseArtifact(await artifact(join(root, 'a'), 'a'));
    const b = await readReleaseArtifact(await artifact(join(root, 'b'), 'b'));
    server = await createArtifactServer(artifactPair(a, b));
    await verifyPublishedBuild(server.origin, a);
    await assert.rejects(verifyPublishedBuild(server.origin, b), /PUBLIC_RELEASE_MISMATCH/);
    assert.deepEqual(
      Buffer.from(await (await fetch(`${server.origin}/create`)).arrayBuffer()),
      a.files.get('/index.html')
    );
    server.select('b');
    assert.deepEqual(
      Buffer.from(await (await fetch(`${server.origin}/offline-worker.js`)).arrayBuffer()),
      b.files.get('/offline-worker.js')
    );
    assert.equal((await fetch(`${server.origin}/__build/a`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${server.origin}/api/relay`, { method: 'POST' })).status, 405);
    assert.throws(() => server.select('other'), /INVALID_RELEASE_SELECTION/);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('应用entry须全等，Cloudflare已知遥测单列但不允许未知外站脚本', () => {
  const build = {
    entryScripts: ['/app-config.js', '/main-a.js'],
    manifest: { assets: [{ path: '/prompt-runtime/editor.js' }] }
  };
  const origin = 'https://media.aiao.io';
  assert.equal(
    classifyEntryScripts(
      [`${origin}/app-config.js`, `${origin}/main-a.js`, 'https://static.cloudflareinsights.com/beacon.min.js/vabc123'],
      origin,
      build
    ),
    1
  );
  assert.throws(
    () =>
      classifyEntryScripts(
        [`${origin}/app-config.js`, `${origin}/main-a.js`, 'https://other.example.test/beacon.js'],
        origin,
        build
      ),
    /UNEXPECTED_RELEASE_SCRIPT/
  );
  assert.throws(() => classifyEntryScripts([`${origin}/main-a.js`], origin, build), /LOADED_RELEASE_MISMATCH/);
  assert.equal(
    classifyEntryScripts(
      [`${origin}/app-config.js`, `${origin}/prompt-runtime/editor.js`, `${origin}/main-a.js`],
      origin,
      build
    ),
    0
  );
  assert.throws(
    () => classifyEntryScripts([`${origin}/app-config.js`, `${origin}/extra.js`, `${origin}/main-a.js`], origin, build),
    /UNEXPECTED_RELEASE_SCRIPT/
  );
});

test('播种采用受支持的无Key备份格式，合法PNG原始字节和摘要不变', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  const seed = createUpdateSeed(png);
  const backup = JSON.parse(seed.backup.toString());
  assert.equal(backup.format, 'aiao-local-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.providers[0].rememberKey, false);
  assert.equal(backup.images[0].sha256, sha256(png));
  assert.deepEqual(Buffer.from(backup.images[0].base64, 'base64'), png);
  assert.ok(!seed.backup.includes('apiKey'));
  assert.ok(!seed.backup.includes('local-test-build'));
});
