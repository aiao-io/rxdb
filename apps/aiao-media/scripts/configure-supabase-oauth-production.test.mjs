import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { configureSupabaseOAuthProduction } from './configure-supabase-oauth-production.mjs';

const clientId = '11111111-2222-4333-8444-555555555555';
const clientSecret = 'sba_fixture_client_secret_value_0123456789';
const cookieSecret = 'c'.repeat(64);
const redirectUri = 'https://media.fixture.test/api/supabase/oauth/callback';

async function rig(callback, config = { name: 'fixture-worker', vars: { SUPABASE_OAUTH_REDIRECT_URI: redirectUri } }) {
  const application = await mkdtemp(join(tmpdir(), 'media-oauth-production-'));
  try {
    await mkdir(join(application, 'deploy'));
    await writeFile(join(application, 'deploy/wrangler.json'), JSON.stringify(config));
    const logs = [];
    const writes = [];
    const asked = [];
    const answers = [clientId, clientSecret];
    await callback({
      application,
      logs,
      writes,
      asked,
      options: {
        application,
        env: {},
        random: () => cookieSecret,
        log: line => logs.push(String(line)),
        ask: async (question, options) => {
          asked.push({ question, hidden: Boolean(options?.hidden) });
          return answers.shift();
        },
        run: async (name, json) => writes.push({ name, secrets: JSON.parse(json) })
      }
    });
  } finally {
    await rm(application, { recursive: true, force: true });
  }
}

test('三项 secret 一次写入配置里的 Worker，Client Secret 的输入不回显且不进入日志', async () => {
  await rig(async ({ options, writes, asked, logs }) => {
    await configureSupabaseOAuthProduction(options);
    assert.deepEqual(writes, [
      {
        name: 'fixture-worker',
        secrets: {
          SUPABASE_OAUTH_CLIENT_ID: clientId,
          SUPABASE_OAUTH_CLIENT_SECRET: clientSecret,
          SUPABASE_OAUTH_COOKIE_SECRET: cookieSecret
        }
      }
    ]);
    assert.deepEqual(
      asked.map(item => item.hidden),
      [false, true],
      'Client ID 可见，Client Secret 隐藏'
    );
    const output = logs.join('\n');
    for (const secret of [clientSecret, cookieSecret]) assert.equal(output.includes(secret), false);
    assert.match(output, /SUPABASE_OAUTH_CLIENT_SECRET/, '只列出名称');
    assert.ok(output.includes(`登记的回调必须是：${redirectUri}`), '提醒 OAuth App 登记同一个回调');
    assert.ok(output.includes('https://media.fixture.test/api/supabase/oauth/status'), '给出部署后的核对入口');
  });
});

test('wrangler.json 没有回调地址时不写入：一键授权永远走不完', async () => {
  await rig(
    async ({ options, writes }) => {
      await assert.rejects(configureSupabaseOAuthProduction(options), /SUPABASE_OAUTH_REDIRECT_URI/);
      assert.deepEqual(writes, []);
    },
    { name: 'fixture-worker', vars: {} }
  );
});

test('环境变量里已有的凭据不再询问', async () => {
  await rig(async ({ options, writes, asked }) => {
    await configureSupabaseOAuthProduction({
      ...options,
      env: { SUPABASE_OAUTH_CLIENT_ID: clientId, SUPABASE_OAUTH_CLIENT_SECRET: clientSecret }
    });
    assert.deepEqual(asked, []);
    assert.equal(writes.length, 1);
  });
});

test('预演只列出将写入的名称，不调用 wrangler', async () => {
  await rig(async ({ options, writes, logs }) => {
    await configureSupabaseOAuthProduction({ ...options, dryRun: true });
    assert.deepEqual(writes, []);
    assert.match(
      logs.join('\n'),
      /SUPABASE_OAUTH_CLIENT_ID.*SUPABASE_OAUTH_CLIENT_SECRET.*SUPABASE_OAUTH_COOKIE_SECRET/s
    );
  });
});

for (const [label, id, secret] of [
  ['占位内容', 'replace_in_worker_secrets', clientSecret],
  ['空的 Client Secret', clientId, '   '],
  ['含空白的 Client Secret', clientId, 'part one part two'],
  ['含换行的 Client ID', `${clientId}\nextra`, clientSecret]
]) {
  test(`${label}被拒绝且不写入`, async () => {
    await rig(async ({ options, writes }) => {
      await assert.rejects(
        configureSupabaseOAuthProduction({
          ...options,
          env: { SUPABASE_OAUTH_CLIENT_ID: id, SUPABASE_OAUTH_CLIENT_SECRET: secret }
        }),
        /Client (ID|Secret)/
      );
      assert.deepEqual(writes, []);
    });
  });
}

test('cookie 密钥太短时不写入', async () => {
  await rig(async ({ options, writes }) => {
    await assert.rejects(configureSupabaseOAuthProduction({ ...options, random: () => 'short' }), /cookie/i);
    assert.deepEqual(writes, []);
  });
});

test('wrangler 写入失败时原样抛出，不报告成功', async () => {
  await rig(async ({ options, logs }) => {
    await assert.rejects(
      configureSupabaseOAuthProduction({
        ...options,
        run: async () => {
          throw new Error('wrangler secret bulk 退出码 1');
        }
      }),
      /退出码 1/
    );
    assert.doesNotMatch(logs.join('\n'), /已写入/);
  });
});
