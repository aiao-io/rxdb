import type { UUID } from '@aiao/rxdb';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { test } from 'vitest';
import { localEnvironment } from '../../../../scripts/supabase/supabase-local.mjs';
import { BackendConfigCommitCache, createBackendConfigCommitRemote } from '../backend-config-commit.ts';
import { openBackendConfigRxdb, type BackendRxdbSession } from './backend-rxdb.ts';

const runLocalSupabaseTest = process.env['AIAO_MEDIA_RUN_LOCAL_SUPABASE'] === '1' ? test : test.skip;

interface Admin {
  userId: string;
  workspaceId: UUID;
  client: SupabaseClient;
  auth: { accessToken: string; userId: string; expiresAt: number };
}

async function createAdmin(
  service: SupabaseClient,
  url: string,
  anonKey: string,
  createdUsers: string[]
): Promise<Admin> {
  const email = `aiao-media-config-sync-${randomUUID()}@local.test`;
  const password = `Local-${randomUUID()}-Password!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user)
    throw new Error(`本地管理员创建失败：${created.error?.message ?? 'missing user'}`);
  const userId = created.data.user.id;
  createdUsers.push(userId);
  const account = await service.from('media_accounts').upsert({ user_id: userId, disabled: false });
  if (account.error) throw new Error(`账号目录写入失败：${account.error.message}`);
  const membership = await service.from('media_admin_memberships').insert({ user_id: userId, enabled: true });
  if (membership.error) throw new Error(`管理员授权写入失败：${membership.error.message}`);
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session)
    throw new Error(`管理员登录失败：${signedIn.error?.message ?? 'missing session'}`);
  const workspace = await client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
  if (workspace.error || !workspace.data?.id)
    throw new Error(`工作区创建失败：${workspace.error?.message ?? 'missing workspace'}`);
  return {
    userId,
    workspaceId: workspace.data.id as UUID,
    client,
    auth: {
      accessToken: signedIn.data.session.access_token,
      userId,
      expiresAt: (signedIn.data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000
    }
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

runLocalSupabaseTest(
  '配置实体经变更日志按工作区双向同步，提交投影经查询缓存写入，状态只由服务端 RPC 推进并可回读',
  { timeout: 90_000 },
  async ({ onTestFinished }) => {
    const { MediaConfigCommit, MediaConfigCommitChange, MediaPromptTemplate, createMediaConfigCommitEnvelope } =
      await import('@aiao-media/domain');
    const { env, url } = await localEnvironment();
    const service = createClient(url, env.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const createdUsers: string[] = [];
    const sessions: BackendRxdbSession[] = [];
    onTestFinished(async () => {
      // 清理失败单独报告，不覆盖用例本身的失败原因。
      const failures: string[] = [];
      for (const session of sessions) await session.close();
      for (const userId of createdUsers) {
        const audit = await service.from('media_admin_audit').delete().eq('actor_id', userId);
        if (audit.error) failures.push(`审计 ${audit.error.message}`);
        const removed = await service.auth.admin.deleteUser(userId);
        if (removed.error) failures.push(`账号 ${removed.error.message}`);
      }
      assert.deepEqual(failures, [], '测试数据必须清理干净');
    });
    const owner = await createAdmin(service, url, env.ANON_KEY, createdUsers);
    const peer = await createAdmin(service, url, env.ANON_KEY, createdUsers);
    const open = async (admin: Admin, role: string) => {
      const session = await openBackendConfigRxdb({
        dbName: `aiao-media-config-${role}-${randomUUID()}`,
        supabaseUrl: url,
        supabaseAnonKey: env.ANON_KEY,
        auth: admin.auth,
        workspaceId: admin.workspaceId,
        enableWorkingTree: true,
        store: 'memory'
      });
      sessions.push(session);
      await session.db.syncManager.syncBranches();
      await session.db.syncManager.sync();
      return session;
    };
    const editor = await open(owner, 'editor');
    const backend = await open(owner, 'backend');
    const outsider = await open(peer, 'outsider');
    const workspaceRule = (workspaceId: UUID) => ({
      combinator: 'and' as const,
      rules: [{ field: 'workspaceId' as const, operator: '=' as const, value: workspaceId }]
    });

    // 1. 配置实体：编辑端写入后经变更日志推送，后台节点拉取；其他工作区的管理员看不到。
    const templates = editor.db.entityManager.getRepository(MediaPromptTemplate);
    const template = await templates.create(
      editor.db.entityManager.instantiate(MediaPromptTemplate, {
        id: randomUUID() as UUID,
        workspaceId: owner.workspaceId,
        branchId: 'main',
        revision: 1,
        key: 'hero',
        title: '首页',
        prompt: '生成海报',
        purpose: null,
        style: 'cinematic',
        tags: ['media'],
        enabled: true
      })
    );
    const pushed = await editor.db.syncManager.push();
    assert.ok(pushed.pushed >= 1, '配置实体必须经变更日志推送到远端');
    const remote = await service
      .from('media_prompt_templates')
      .select('id,workspaceId,key,title,tags')
      .eq('id', template.id)
      .single();
    assert.equal(remote.error, null);
    assert.deepEqual(remote.data, {
      id: template.id,
      workspaceId: owner.workspaceId,
      key: 'hero',
      title: '首页',
      tags: ['media']
    });
    await backend.db.syncManager.sync();
    const pulled = await firstValueFrom(
      backend.db.entityManager.getRepository(MediaPromptTemplate).findAll({ where: workspaceRule(owner.workspaceId) })
    );
    assert.deepEqual(
      pulled.map(row => row.id),
      [template.id]
    );
    await outsider.db.syncManager.sync();
    assert.deepEqual(
      await firstValueFrom(
        outsider.db.entityManager
          .getRepository(MediaPromptTemplate)
          .findAll({ where: workspaceRule(owner.workspaceId) })
      ),
      []
    );
    const ownerLog = await owner.client
      .from('rxdb_change')
      .select('id')
      .eq('entity', 'MediaPromptTemplate')
      .eq('entityId', template.id);
    const peerLog = await peer.client
      .from('rxdb_change')
      .select('id')
      .eq('entity', 'MediaPromptTemplate')
      .eq('entityId', template.id);
    assert.equal(ownerLog.error, null);
    assert.ok((ownerLog.data ?? []).length >= 1, '本工作区管理员可以读到配置变更日志');
    assert.deepEqual(peerLog.data, [], '其他工作区管理员读不到配置变更日志');

    // 2. 工作树只捕获配置实体；投影实体按查询缓存读写，不进工作树。
    const before = await editor.db.workingTree.diff();
    assert.deepEqual([...new Set(before.entries.map(entry => entry.entity))], ['MediaPromptTemplate']);

    const envelope = await createMediaConfigCommitEnvelope({
      id: randomUUID(),
      workspaceId: owner.workspaceId,
      branchId: 'main',
      parentIds: [],
      authorId: owner.userId,
      message: '新增首页模板',
      operationId: randomUUID(),
      status: 'prepared',
      changes: [
        {
          id: randomUUID(),
          sequence: 1,
          entity: 'MediaPromptTemplate',
          entityId: template.id,
          operation: 'insert',
          patch: {
            value: {
              key: 'hero',
              title: '首页',
              prompt: '生成海报',
              purpose: null,
              style: 'cinematic',
              tags: ['media'],
              enabled: true
            }
          },
          inversePatch: null,
          expectedRevision: null
        }
      ]
    });
    // 投影由服务端推进状态：客户端经 PostgREST 写 prepared 与变更，再标记 synced（触发器核对完整性）；
    // 读取走 RxDB 查询缓存。Supabase 适配器不提供查询缓存的远端写。
    const author = owner.userId;
    const insertedCommit = await owner.client.from('media_config_projection_commits').insert({
      id: envelope.commit.id,
      workspaceId: owner.workspaceId,
      branchId: envelope.commit.branchId,
      parentIds: envelope.commit.parentIds,
      authorId: author,
      message: envelope.commit.message,
      operationId: envelope.commit.operationId,
      contentFingerprint: envelope.commit.contentFingerprint,
      changeCount: envelope.commit.changeCount,
      status: 'prepared',
      createdBy: author,
      updatedBy: author
    });
    assert.equal(insertedCommit.error, null);
    const prematureSync = await owner.client
      .from('media_config_projection_commits')
      .update({ status: 'synced' })
      .eq('id', envelope.commit.id);
    assert.equal(prematureSync.error?.code, '22023', '变更未到齐时不能标记 synced');
    const insertedChanges = await owner.client.from('media_config_projection_changes').insert(
      envelope.changes.map(change => ({
        id: change.id,
        workspaceId: owner.workspaceId,
        commitId: envelope.commit.id,
        sequence: change.sequence,
        entity: change.entity,
        entityId: change.entityId,
        operation: change.operation,
        patch: change.patch,
        inversePatch: change.inversePatch,
        expectedRevision: change.expectedRevision,
        contentFingerprint: change.contentFingerprint,
        createdBy: author,
        updatedBy: author
      }))
    );
    assert.equal(insertedChanges.error, null);
    const synced = await owner.client
      .from('media_config_projection_commits')
      .update({ status: 'synced' })
      .eq('id', envelope.commit.id);
    assert.equal(synced.error, null);
    const after = await editor.db.workingTree.diff();
    assert.deepEqual(
      [...new Set(after.entries.map(entry => entry.entity))],
      ['MediaPromptTemplate'],
      '投影写入不得进入工作树'
    );
    const remoteCommit = await service
      .from('media_config_projection_commits')
      .select('status,changeCount,workspaceId')
      .eq('id', envelope.commit.id)
      .single();
    assert.deepEqual(remoteCommit.data, { status: 'synced', changeCount: 1, workspaceId: owner.workspaceId });

    // 3. 后台节点经查询缓存读取完整投影并校验指纹，再以普通 JWT 调用原子应用 RPC。
    const cache = new BackendConfigCommitCache(createBackendConfigCommitRemote(backend.db), {
      workspaceId: owner.workspaceId
    });
    const loaded = await cache.load(envelope.commit.id);
    assert.equal(loaded.commit.contentFingerprint, envelope.commit.contentFingerprint);
    assert.equal(loaded.changes.length, 1);
    const applied = await backend.supabase.rpc('apply_media_config_commit', {
      p_commit_id: envelope.commit.id,
      p_operation_id: envelope.commit.operationId
    });
    assert.equal(applied.error, null);
    assert.equal((applied.data as { status: string }).status, 'applied');
    const replay = await backend.supabase.rpc('apply_media_config_commit', {
      p_commit_id: envelope.commit.id,
      p_operation_id: envelope.commit.operationId
    });
    assert.equal((replay.data as { reused: boolean }).reused, true);

    // 4. 编辑端经查询缓存回读服务端推进的状态；客户端伪造状态被远端拒绝。
    const commits = editor.db.entityManager.getRepository(MediaConfigCommit);
    const byId = {
      combinator: 'and' as const,
      rules: [{ field: 'id' as const, operator: '=' as const, value: envelope.commit.id as UUID }]
    };
    const refreshed = await firstValueFrom(commits.findAll({ where: byId }));
    assert.equal(refreshed[0]?.status, 'applied');
    assert.ok(refreshed[0]?.appliedAt);
    const changesInCache = await firstValueFrom(
      editor.db.entityManager.getRepository(MediaConfigCommitChange).findAll({
        where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: envelope.commit.id as UUID }] }
      })
    );
    assert.deepEqual(
      changesInCache.map(change => change.sequence),
      [1]
    );
    const forged = await owner.client
      .from('media_config_projection_commits')
      .update({ status: 'released' })
      .eq('id', envelope.commit.id);
    assert.equal(forged.error?.code, '42501');
    const unchanged = await service
      .from('media_config_projection_commits')
      .select('status')
      .eq('id', envelope.commit.id)
      .single();
    assert.equal(unchanged.data?.status, 'applied');

    // 5. 其他工作区的管理员看不到投影。
    await delay(1_100);
    assert.deepEqual(
      await firstValueFrom(
        outsider.db.entityManager.getRepository(MediaConfigCommit).findAll({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: envelope.commit.id as UUID }] }
        })
      ),
      []
    );
  }
);
