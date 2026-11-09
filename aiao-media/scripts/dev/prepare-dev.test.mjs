import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { writeDevelopmentConfig } from './prepare-dev.mjs';

test('local development isolates Worker secrets and needs no frontend build', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'aiao-media-dev-'));
  const api = resolve(root, 'apps/api');
  const config = {
    main: 'src/local-first-worker.ts',
    name: 'aiao-media',
    assets: { directory: '../web/dist/browser', binding: 'ASSETS' },
    vars: { ALLOWED_PROVIDER_BASE_URLS: '["https://provider.test"]' },
    durable_objects: { bindings: [{ name: 'RELAY_TASKS', class_name: 'RelayTask' }] },
    r2_buckets: [{ binding: 'RELAY_RESULTS', bucket_name: 'test-results' }]
  };
  const local = {
    url: 'http://127.0.0.1:55421',
    env: { ANON_KEY: 'public-local-key', SERVICE_ROLE_KEY: 'private-local-key' },
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
    assert.equal(generated.assets, undefined);
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
