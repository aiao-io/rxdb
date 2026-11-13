import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { writeDevelopmentConfig } from './prepare-dev.mjs';
import { developmentAccounts } from './seed-accounts.mjs';

test('local development isolates Worker secrets and needs no frontend build', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'aiao-media-dev-'));
  const api = resolve(root, 'apps/api');
  const config = {
    main: 'src/local-first-worker.ts',
    name: 'aiao-media',
    assets: {
      directory: '../web/dist/browser',
      binding: 'ASSETS',
      html_handling: 'none',
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*', '/admin', '/admin/*']
    },
    vars: { ALLOWED_PROVIDER_BASE_URLS: '["https://provider.test"]' },
    durable_objects: { bindings: [{ name: 'RELAY_TASKS', class_name: 'RelayTask' }] },
    r2_buckets: [{ binding: 'RELAY_RESULTS', bucket_name: 'test-results' }]
  };
  const local = {
    url: 'http://127.0.0.1:55421',
    mailUrl: 'http://127.0.0.1:55424',
    env: {
      ANON_KEY: 'public-local-key',
      SERVICE_ROLE_KEY: 'private-local-key',
      JWT_SECRET: 'private-jwt-secret',
      POSTGRES_PASSWORD: 'local-database-password',
      DB_PORT: '55422',
      STUDIO_PORT: '55423'
    },
    publicEnv: {
      AIAO_SUPABASE_URL: 'http://127.0.0.1:55421',
      AIAO_SUPABASE_ANON_KEY: `header.${Buffer.from('{"role":"anon"}').toString('base64url')}.signature`
    }
  };
  try {
    await mkdir(api, { recursive: true });
    await writeFile(resolve(api, 'wrangler.json'), JSON.stringify(config));
    await writeFile(resolve(api, '.dev.vars'), 'existing-private-config');
    await writeDevelopmentConfig(root, local);

    const generated = JSON.parse(await readFile(resolve(api, '.wrangler/local-dev/wrangler.json'), 'utf8'));
    assert.deepEqual(generated.assets, {
      ...config.assets,
      directory: resolve(api, '.wrangler/local-dev/assets'),
      html_handling: 'auto-trailing-slash',
      not_found_handling: 'none'
    });
    const homepage = await readFile(resolve(generated.assets.directory, 'index.html'), 'utf8');
    assert.equal((await stat(resolve(generated.assets.directory, 'index.html'))).mode & 0o777, 0o600);
    assert.match(homepage, /Aiao Media 开发导航/);
    assert.match(homepage, /href="\/api\/templates"/);
    for (const address of ['http://localhost:4300', 'http://localhost:4302', local.url, local.mailUrl])
      assert.ok(homepage.includes(`href="${address}"`), address);
    assert.ok(homepage.includes('http://127.0.0.1:55423'));
    assert.ok(homepage.includes('127.0.0.1:55422'));
    for (const account of developmentAccounts) {
      assert.ok(homepage.includes(account.email));
      assert.ok(homepage.includes(account.password));
    }
    assert.ok(homepage.includes(local.env.POSTGRES_PASSWORD));
    assert.ok(!homepage.includes(local.env.JWT_SECRET));
    assert.ok(!homepage.includes(local.env.SERVICE_ROLE_KEY));
    assert.doesNotMatch(homepage, /\{\{.*?\}\}/);
    assert.match(await readFile(resolve(generated.assets.directory, '_headers'), 'utf8'), /Cache-Control: no-store/);
    assert.equal(generated.main, resolve(api, config.main));
    assert.deepEqual(generated.vars, config.vars);
    assert.deepEqual(generated.durable_objects, config.durable_objects);
    assert.deepEqual(generated.r2_buckets, config.r2_buckets);
    const secrets = resolve(api, '.wrangler/local-dev/.dev.vars');
    assert.deepEqual(
      { ...parseEnv(await readFile(secrets, 'utf8')) },
      {
        MEDIA_SUPABASE_URL: local.url,
        MEDIA_SUPABASE_ANON_KEY: local.env.ANON_KEY,
        MEDIA_SUPABASE_SERVICE_ROLE_KEY: local.env.SERVICE_ROLE_KEY
      }
    );
    assert.equal((await stat(secrets)).mode & 0o777, 0o600);
    const browser = await readFile(resolve(root, 'apps/web/public/app-config.js'), 'utf8');
    assert.ok(browser.includes(local.publicEnv.AIAO_SUPABASE_URL));
    assert.ok(browser.includes(local.publicEnv.AIAO_SUPABASE_ANON_KEY));
    assert.ok(!browser.includes(local.env.SERVICE_ROLE_KEY));
    assert.ok(!browser.includes(local.env.POSTGRES_PASSWORD));
    for (const account of developmentAccounts) assert.ok(!browser.includes(account.password));
    assert.ok(!JSON.stringify(generated).includes(local.env.SERVICE_ROLE_KEY));
    assert.equal(await readFile(resolve(api, '.dev.vars'), 'utf8'), 'existing-private-config');
    assert.deepEqual(JSON.parse(await readFile(resolve(api, 'wrangler.json'), 'utf8')), config);

    await writeDevelopmentConfig(root, { ...local, env: { ...local.env, SERVICE_ROLE_KEY: 'rotated-local-key' } });
    assert.equal(parseEnv(await readFile(secrets, 'utf8')).MEDIA_SUPABASE_SERVICE_ROLE_KEY, 'rotated-local-key');
    assert.equal((await stat(secrets)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('平台模型与引用凭据仅写 Worker 私有环境，重跑保留源配置并隔离浏览器', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'aiao-media-model-dev-')),
    api = resolve(root, 'apps/api');
  const models = JSON.stringify([
    {
      id: 'standard',
      name: '平台生图',
      baseUrl: 'https://provider.test',
      model: 'private-model',
      secret: 'IMAGE_TEST_KEY',
      credits: 3
    }
  ]);
  const config = {
    main: 'src/local-first-worker.ts',
    vars: { ALLOWED_PROVIDER_BASE_URLS: '["https://provider.test"]' },
    durable_objects: { bindings: [] }
  };
  const local = {
    url: 'http://127.0.0.1:55421',
    mailUrl: 'http://127.0.0.1:55424',
    env: { ANON_KEY: 'local-public', SERVICE_ROLE_KEY: 'local-private' },
    publicEnv: {}
  };
  const source = `MEDIA_PLATFORM_MODELS='${models}'\nIMAGE_TEST_KEY="private-model-key"\nUNRELATED_PRIVATE_KEY="do-not-copy"\n`;
  try {
    await mkdir(api, { recursive: true });
    await writeFile(resolve(api, 'wrangler.json'), JSON.stringify(config));
    await writeFile(resolve(api, '.dev.vars'), source);
    await writeDevelopmentConfig(root, local, {});
    const secrets = resolve(api, '.wrangler/local-dev/.dev.vars');
    const values = parseEnv(await readFile(secrets, 'utf8'));
    assert.equal(values.MEDIA_PLATFORM_MODELS, models);
    assert.equal(values.IMAGE_TEST_KEY, 'private-model-key');
    assert.equal(values.UNRELATED_PRIVATE_KEY, undefined);
    assert.equal((await stat(secrets)).mode & 0o777, 0o600);
    assert.equal(await readFile(resolve(api, '.dev.vars'), 'utf8'), source);
    const browser = await readFile(resolve(root, 'apps/web/public/app-config.js'), 'utf8');
    for (const value of ['private-model-key', 'IMAGE_TEST_KEY', 'private-model', 'do-not-copy'])
      assert.ok(!browser.includes(value));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
