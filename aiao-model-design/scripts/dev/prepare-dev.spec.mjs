import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { renderDashboard, writeDevelopmentConfig } from './prepare-dev.mjs';
import { developmentAccounts } from './seed-accounts.mjs';
import { webUrl } from './services.mjs';

const config = {
  $schema: './node_modules/wrangler/config-schema.json',
  name: 'aiao-model-design',
  main: 'src/index.ts',
  compatibility_date: '2026-11-07',
  limits: { cpu_ms: 300000 },
  workers_dev: true,
  assets: {
    directory: '../../../dist/aiao-model-design/apps/web/browser',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*', '/bff/*', '/health']
  },
  observability: { enabled: true }
};

const local = {
  url: 'http://127.0.0.1:54421',
  databaseUrl: 'postgresql://postgres:local-database-password@127.0.0.1:54422/postgres',
  env: {
    API_PORT: '54421',
    DB_PORT: '54422',
    POSTGRES_PASSWORD: 'local-database-password',
    JWT_SECRET: 'private-jwt-secret',
    ANON_KEY: 'local-anon-key',
    SERVICE_ROLE_KEY: 'private-service-role-key'
  }
};

const deployed = {
  mode: 'deployed',
  environment: 'prod',
  apiUrl: 'http://localhost:8030',
  secretKey: 'tr_prod_private0123456789abcdef'
};

async function product(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-dev-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const api = path.join(root, 'apps/api');
  await mkdir(api, { recursive: true });
  await writeFile(path.join(api, 'wrangler.jsonc'), JSON.stringify(config, null, 2));
  await writeFile(path.join(api, '.dev.vars'), 'SUPABASE_URL="https://remote.supabase.co"\n');
  const localDev = path.join(api, '.wrangler/local-dev');
  return { root, api, localDev, secrets: path.join(localDev, '.dev.vars') };
}

test('Worker 的本地配置与密钥只写进忽略的 local-dev 目录，导航页不含服务端密钥', async t => {
  const { root, api, localDev, secrets } = await product(t);
  await writeDevelopmentConfig(root, { local, agent: deployed });

  const generated = JSON.parse(await readFile(path.join(localDev, 'wrangler.json'), 'utf8'));
  const assets = path.join(localDev, 'assets');
  const { $schema, ...rest } = config;
  assert.ok($schema);
  assert.deepEqual(generated, {
    ...rest,
    main: path.join(api, 'src/index.ts'),
    assets: { ...config.assets, directory: assets, html_handling: 'auto-trailing-slash', not_found_handling: 'none' }
  });

  const homepage = await readFile(path.join(assets, 'index.html'), 'utf8');
  assert.equal((await stat(path.join(assets, 'index.html'))).mode & 0o777, 0o600);
  assert.match(homepage, /<title>Aiao Model Design 开发导航<\/title>/);
  for (const href of [
    `${webUrl}/model-designer/canvas`,
    `${webUrl}/login.html`,
    '/api/agent/config',
    local.url,
    deployed.apiUrl
  ])
    assert.ok(homepage.includes(`href="${href}"`), href);
  for (const account of developmentAccounts) {
    assert.ok(homepage.includes(account.email));
    assert.ok(homepage.includes(account.password));
  }
  assert.ok(homepage.includes(local.env.POSTGRES_PASSWORD));
  assert.ok(homepage.includes('127.0.0.1:54422'));
  assert.ok(homepage.includes('data-agent="deployed"'));
  for (const secret of [local.env.JWT_SECRET, local.env.SERVICE_ROLE_KEY, local.env.ANON_KEY, deployed.secretKey])
    assert.ok(!homepage.includes(secret), secret);
  assert.doesNotMatch(homepage, /\{\{.*?\}\}/);
  assert.match(await readFile(path.join(assets, '_headers'), 'utf8'), /Cache-Control: no-store/);

  assert.deepEqual(
    { ...parseEnv(await readFile(secrets, 'utf8')) },
    {
      SUPABASE_URL: local.url,
      SUPABASE_ANON_KEY: local.env.ANON_KEY,
      TRIGGER_API_URL: deployed.apiUrl,
      TRIGGER_SECRET_KEY: deployed.secretKey
    }
  );
  assert.equal((await stat(secrets)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(generated).includes(deployed.secretKey));
  assert.equal(await readFile(path.join(api, '.dev.vars'), 'utf8'), 'SUPABASE_URL="https://remote.supabase.co"\n');
  assert.deepEqual(JSON.parse(await readFile(path.join(api, 'wrangler.jsonc'), 'utf8')), config);

  await writeDevelopmentConfig(root, {
    local: { ...local, env: { ...local.env, ANON_KEY: 'rotated-anon-key' } },
    agent: deployed
  });
  assert.equal(parseEnv(await readFile(secrets, 'utf8')).SUPABASE_ANON_KEY, 'rotated-anon-key');
  assert.equal((await stat(secrets)).mode & 0o777, 0o600);
});

test('AI 未启用时 Worker 拿不到 Trigger.dev 配置，导航页说明怎么开启', async t => {
  const { root, localDev, secrets } = await product(t);
  await writeDevelopmentConfig(root, { local, agent: { mode: 'disabled' } });
  assert.deepEqual(Object.keys(parseEnv(await readFile(secrets, 'utf8'))).sort(), [
    'SUPABASE_ANON_KEY',
    'SUPABASE_URL'
  ]);
  const homepage = await readFile(path.join(localDev, 'assets/index.html'), 'utf8');
  assert.ok(homepage.includes('data-agent="disabled"'));
  assert.ok(homepage.includes('apps/api/.dev.vars'));
});

test('模板取值按 HTML 转义，用到未提供的取值时报错', () => {
  assert.equal(
    renderDashboard('<a href="{{ URL }}">{{NAME}}</a>', { URL: 'http://x/?a="1"&b', NAME: "<b>Tom's</b>" }),
    '<a href="http://x/?a=&quot;1&quot;&amp;b">&lt;b&gt;Tom&#39;s&lt;/b&gt;</a>'
  );
  assert.throws(() => renderDashboard('<p>{{ MISSING }}</p>', {}), /MISSING/);
});
