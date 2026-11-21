import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localEnvironment } from './supabase-local.mjs';

const { env, url } = await localEnvironment();
const service = createClient(url, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const createdUsers = [];

async function createTestUser(label) {
  const email = `aiao-media-rxdb-${label}-${randomUUID()}@local.test`;
  const password = `Local-${randomUUID()}-Password!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user)
    throw new Error(`本地测试账号创建失败：${created.error?.message ?? 'missing user'}`);
  const user = created.data.user;
  createdUsers.push(user.id);
  const account = await service
    .from('media_accounts')
    .upsert({ user_id: user.id, disabled: false })
    .select('user_id')
    .single();
  if (account.error) throw new Error(`本地测试账号目录写入失败：${account.error.message}`);
  const client = createClient(url, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session)
    throw new Error(`本地测试账号登录失败：${signedIn.error?.message ?? 'missing session'}`);
  return {
    client,
    user,
    accessToken: signedIn.data.session.access_token,
    sessionExpiresAt: signedIn.data.session.expires_at
  };
}

try {
  const first = await createTestUser('one');
  const second = await createTestUser('two');
  assert.notEqual(first.accessToken, env.SERVICE_ROLE_KEY);
  assert.match(first.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);

  const firstWorkspace = await first.client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
  const secondWorkspace = await second.client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
  if (firstWorkspace.error || secondWorkspace.error)
    throw new Error(`工作区 RPC 失败：${firstWorkspace.error?.message ?? secondWorkspace.error?.message}`);
  const workspaceOne = firstWorkspace.data.id;
  const workspaceTwo = secondWorkspace.data.id;
  assert.notEqual(workspaceOne, workspaceTwo);

  const memberships = await service.from('media_admin_memberships').upsert([
    { user_id: first.user.id, enabled: true, revision: 1 },
    { user_id: second.user.id, enabled: true, revision: 1 }
  ]);
  if (memberships.error) throw new Error(`管理员 membership 写入失败：${memberships.error.message}`);

  const recordId = randomUUID();
  const record = await service.from('media_config_records').insert({
    workspace_id: workspaceOne,
    branch_id: 'main',
    entity: 'MediaPromptTemplate',
    entity_id: recordId,
    revision: 1,
    payload: { key: 'local-contract', title: '本地契约', prompt: 'prompt', enabled: true },
    deleted: false,
    updated_by: first.user.id
  });
  if (record.error) throw new Error(`配置记录写入失败：${record.error.message}`);

  const ownConfig = await first.client
    .from('media_config_records')
    .select('entity_id,workspace_id')
    .eq('workspace_id', workspaceOne);
  if (ownConfig.error) throw new Error(`自有工作区查询失败：${ownConfig.error.message}`);
  assert.deepEqual(
    ownConfig.data.map(row => row.entity_id),
    [recordId]
  );

  const crossConfig = await second.client
    .from('media_config_records')
    .select('entity_id')
    .eq('workspace_id', workspaceOne);
  if (crossConfig.error) throw new Error(`跨工作区查询返回错误：${crossConfig.error.message}`);
  assert.deepEqual(crossConfig.data, []);

  const taskId = randomUUID();
  const enqueue = await first.client.rpc('media_enqueue_generation_poc', {
    p_task_id: taskId,
    p_task_revision: 1,
    p_kind: 'image-generation'
  });
  if (enqueue.error || typeof enqueue.data !== 'number')
    throw new Error(`PGMQ 入队失败：${enqueue.error?.message ?? 'missing message id'}`);

  const invalidEnqueue = await first.client.rpc('media_enqueue_generation_poc', {
    p_task_id: taskId,
    p_task_revision: 0,
    p_kind: 'image-generation'
  });
  assert.ok(invalidEnqueue.error, '无效 revision 必须回滚入队事务');

  const metrics = await service.rpc('media_pgmq_generation_poc_metrics');
  if (metrics.error) throw new Error(`PGMQ 指标读取失败：${metrics.error.message}`);
  assert.equal(metrics.data.queue, 'media_generation_poc');
  console.log(
    JSON.stringify({
      ordinaryJwt: true,
      workspaceIsolation: true,
      pgmqEnqueue: true,
      pgmqInvalidRollback: true,
      queue: metrics.data.queue
    })
  );
} finally {
  for (const userId of createdUsers) await service.auth.admin.deleteUser(userId);
}
