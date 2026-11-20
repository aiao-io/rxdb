import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { localEnvironment } from '../../../scripts/supabase/supabase-local.mjs';

const localIntegrationEnabled = process.env['AIAO_MEDIA_RUN_LOCAL_SUPABASE'] === '1';
const configuredIntegrationEnabled = Boolean(
  process.env['AIAO_MEDIA_SUPABASE_URL'] &&
  process.env['AIAO_MEDIA_SUPABASE_ANON_KEY'] &&
  process.env['AIAO_MEDIA_SUPABASE_ACCESS_TOKEN'] &&
  process.env['AIAO_MEDIA_PGMQ_TASK_ID']
);

const migrationPath = resolve(import.meta.dirname, '../../../infra/supabase/migrations/019-pgmq-generation.sql');

test('PGMQ migration validates the message before sending it and keeps the queue isolated', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.media_enqueue_generation_poc/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.media_enqueue_generation_poc[\s\S]*?SECURITY DEFINER/);
  assert.match(sql, /IF NOT media_private\.account_enabled\(\)/);
  assert.match(sql, /IF p_task_id IS NULL OR p_task_revision IS NULL OR p_task_revision <= 0/);
  assert.match(sql, /pgmq\.send\(\s*'media_generation_poc'/s);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.media_enqueue_generation_poc/);
});

test(
  'local Supabase PGMQ enqueue, authorization and failed-call rollback contract',
  { skip: !localIntegrationEnabled && !configuredIntegrationEnabled },
  async () => {
    let baseUrl: string;
    let anonKey: string;
    let token: string;
    let taskId: string;
    let serviceRoleKey: string | undefined;
    const createdUsers: string[] = [];

    if (localIntegrationEnabled) {
      const local = await localEnvironment();
      baseUrl = local.url;
      anonKey = local.env.ANON_KEY;
      serviceRoleKey = local.env.SERVICE_ROLE_KEY;
      const service = createClient(baseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const email = `aiao-media-pgmq-${randomUUID()}@local.test`;
      const password = `Local-${randomUUID()}-Password!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user)
        throw new Error(`PGMQ 测试账号创建失败：${created.error?.message ?? 'missing user'}`);
      createdUsers.push(created.data.user.id);
      const account = await service
        .from('media_accounts')
        .upsert({ user_id: created.data.user.id, disabled: false })
        .select('user_id')
        .single();
      if (account.error) throw new Error(`PGMQ 测试账号目录写入失败：${account.error.message}`);
      const client = createClient(baseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session)
        throw new Error(`PGMQ 测试账号登录失败：${signedIn.error?.message ?? 'missing session'}`);
      token = signedIn.data.session.access_token;
      taskId = randomUUID();
    } else {
      baseUrl = process.env['AIAO_MEDIA_SUPABASE_URL'] as string;
      anonKey = process.env['AIAO_MEDIA_SUPABASE_ANON_KEY'] as string;
      token = process.env['AIAO_MEDIA_SUPABASE_ACCESS_TOKEN'] as string;
      taskId = process.env['AIAO_MEDIA_PGMQ_TASK_ID'] as string;
    }

    try {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/rest/v1/rpc/media_enqueue_generation_poc`;
      const headers = {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      };
      const valid = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_task_id: taskId, p_task_revision: 1, p_kind: 'image-generation' })
      });
      const validBody = await valid.text();
      assert.equal(valid.ok, true, validBody);
      const messageId = JSON.parse(validBody) as unknown;
      assert.equal(typeof messageId, 'number');

      const invalid = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_task_id: taskId, p_task_revision: 0, p_kind: 'image-generation' })
      });
      assert.equal(invalid.ok, false);

      const anonymous = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ p_task_id: randomUUID(), p_task_revision: 1, p_kind: 'image-generation' })
      });
      assert.equal(anonymous.ok, false);

      if (serviceRoleKey) {
        const service = createClient(baseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const metrics = await service.rpc('media_pgmq_generation_poc_metrics');
        if (metrics.error) throw new Error(`PGMQ 指标读取失败：${metrics.error.message}`);
        assert.equal(metrics.data?.queue, 'media_generation_poc');
        assert.equal(metrics.data?.config?.enabled, false);
      }
    } finally {
      if (serviceRoleKey) {
        const service = createClient(baseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        for (const userId of createdUsers) await service.auth.admin.deleteUser(userId);
      }
    }
  }
);
