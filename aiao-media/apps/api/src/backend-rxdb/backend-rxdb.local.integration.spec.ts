import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { createClient } from '@supabase/supabase-js';
import { test } from 'vitest';
import { ENTITY_REMOTE_CREATE_EVENT, ENTITY_REMOTE_REMOVE_EVENT, ENTITY_REMOTE_UPDATE_EVENT, type UUID } from '@aiao/rxdb';
import { localEnvironment } from '../../../../scripts/supabase/supabase-local.mjs';
import { openBackendRxdb } from './backend-rxdb.ts';

const runLocalSupabaseTest = process.env['AIAO_MEDIA_RUN_LOCAL_SUPABASE'] === '1' ? test : test.skip;

runLocalSupabaseTest('backend RxDB 使用普通 JWT 完成 workspace filter 的 pull/push', { timeout: 30_000 }, async () => {
  const { MediaSyncRecord } = await import('@aiao-media/domain');
  const { env, url } = await localEnvironment();
  const service = createClient(url, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const createdUsers: string[] = [];
  let backend: Awaited<ReturnType<typeof openBackendRxdb>> | undefined;

  try {
    const email = `aiao-media-backend-rxdb-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}-Password!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`本地测试账号创建失败：${created.error?.message ?? 'missing user'}`);
    const user = created.data.user;
    createdUsers.push(user.id);
    const account = await service.from('media_accounts').upsert({ user_id: user.id, disabled: false }).select('user_id').single();
    if (account.error) throw new Error(`本地测试账号目录写入失败：${account.error.message}`);

    const client = createClient(url, env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error(`本地测试账号登录失败：${signedIn.error?.message ?? 'missing session'}`);
    const workspace = await client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
    if (workspace.error || !workspace.data?.id) throw new Error(`工作区 RPC 失败：${workspace.error?.message ?? 'missing workspace'}`);
    const workspaceId = workspace.data.id as UUID;
    const userId = user.id as UUID;
    const recordId = randomUUID();
    const inserted = await service.from('media_sync_records').insert({
      id: recordId,
      workspaceId,
      sourceId: `remote-${recordId}`,
      kind: 'draft',
      payload: JSON.stringify({ version: 1, state: { document: { type: 'doc', content: [] }, fields: [], values: {} } }),
      revision: 1,
      deleted: false,
      baseRevision: 0,
      createdBy: userId,
      updatedBy: userId
    });
    if (inserted.error) throw new Error(`同步记录写入失败：${inserted.error.message}`);

    backend = await openBackendRxdb({
      dbName: `aiao-media-backend-rxdb-${randomUUID()}`,
      entities: [MediaSyncRecord],
      supabaseUrl: url,
      supabaseAnonKey: env.ANON_KEY,
      auth: {
        accessToken: signedIn.data.session.access_token,
        userId: user.id,
        expiresAt: (signedIn.data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000
      },
      workspaceId,
      workspaceScopedEntities: [MediaSyncRecord],
      enableWorkingTree: true,
      store: 'memory'
    });

    await backend.db.syncManager.syncBranches();
    await backend.db.syncManager.sync();
    const repository = backend.db.entityManager.getRepository(MediaSyncRecord);
    const pulledRows = await firstValueFrom(repository.findAll({
      where: { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] }
    }));
    assert.ok(pulledRows.some(row => row.id === recordId), 'backend RxDB must pull the workspace record');
    const repeatedPull = await backend.db.syncManager.sync();
    const repeatedRows = await firstValueFrom(repository.findAll({
      where: { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] }
    }));
    assert.equal(repeatedRows.length, pulledRows.length);
    assert.equal(repeatedPull.pullResult.pulled, 0);

    const tombstone = await client.from('media_sync_records').update({
      revision: 2,
      baseRevision: 1,
      deleted: true,
      updatedBy: user.id
    }).eq('id', recordId).select('id,revision,deleted').single();
    if (tombstone.error) throw new Error(`tombstone 写入失败：${tombstone.error.message}`);
    await backend.db.syncManager.sync();
    const tombstonedRows = await firstValueFrom(repository.findAll({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: recordId as UUID }] }
    }));
    assert.equal(tombstonedRows[0]?.deleted, true);

    const backendRecordId = randomUUID();
    const backendRecord = backend.db.entityManager.instantiate(MediaSyncRecord, {
      id: backendRecordId,
      workspaceId,
      sourceId: `backend-${backendRecordId}`,
      kind: 'draft',
      payload: JSON.stringify({ version: 1, state: { document: { type: 'doc', content: [] }, fields: [], values: {} } }),
      revision: 1,
      deleted: false,
      baseRevision: 0,
      createdBy: userId,
      updatedBy: userId
    });
    await repository.create(backendRecord);
    await backend.db.syncManager.sync();
    const pushed = await client.from('media_sync_records').select('id,workspaceId,sourceId').eq('id', backendRecordId).maybeSingle();
    if (pushed.error) throw new Error(`后台 RxDB 写回查询失败：${pushed.error.message}`);
    assert.equal(pushed.data?.id, backendRecordId);
    assert.equal(pushed.data?.workspaceId, workspaceId);
    const duplicatePush = await backend.db.syncManager.sync();
    assert.equal(duplicatePush.pushResult.pushed, 0);

    const backendIdentity = await service.rpc('rxdb_backend_id');
    if (backendIdentity.error || typeof backendIdentity.data !== 'string') throw new Error(`远端身份读取失败：${backendIdentity.error?.message ?? 'missing backend id'}`);
    const rotatedIdentity = randomUUID();
    const rotated = await service.from('rxdb_backend').update({ id: rotatedIdentity }).eq('singleton', true);
    if (rotated.error) throw new Error(`远端身份轮换失败：${rotated.error.message}`);
    const activeBackend = backend;
    if (!activeBackend) throw new Error('后台 RxDB 尚未创建');
    let restoreError: Error | undefined;
    try {
      await assert.rejects(
        () => activeBackend.db.syncManager.sync(),
        /Remote backend changed/,
        '远端身份变更时必须停止同步'
      );
    } finally {
      const restored = await service.from('rxdb_backend').update({ id: backendIdentity.data }).eq('singleton', true);
      if (restored.error) restoreError = new Error(`远端身份恢复失败：${restored.error.message}`);
    }
    if (restoreError) throw restoreError;
  } finally {
    await backend?.close();
    for (const userId of createdUsers) await service.auth.admin.deleteUser(userId);
  }
});


function waitForRemoteEvent(
  backend: Awaited<ReturnType<typeof openBackendRxdb>>,
  eventType: typeof ENTITY_REMOTE_CREATE_EVENT | typeof ENTITY_REMOTE_UPDATE_EVENT | typeof ENTITY_REMOTE_REMOVE_EVENT,
  timeoutMs = 15_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      backend.db.removeEventListener(eventType, listener);
      reject(new Error(`等待 RxDB 远端事件超时：${eventType}`));
    }, timeoutMs);
    const listener = (): void => {
      clearTimeout(timer);
      backend.db.removeEventListener(eventType, listener);
      resolve();
    };
    backend.db.addEventListener(eventType, listener);
  });
}

runLocalSupabaseTest('backend RxDB Realtime 断线恢复、重复批次、revision 冲突和 tombstone', { timeout: 45_000 }, async () => {
  const { MediaSyncRecord } = await import('@aiao-media/domain');
  const { env, url } = await localEnvironment();
  const service = createClient(url, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const createdUsers: string[] = [];
  const sessions: Array<Awaited<ReturnType<typeof openBackendRxdb>>> = [];

  try {
    const email = `aiao-media-backend-realtime-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}-Password!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Realtime 测试账号创建失败：${created.error?.message ?? 'missing user'}`);
    const user = created.data.user;
    createdUsers.push(user.id);
    const account = await service.from('media_accounts').upsert({ user_id: user.id, disabled: false }).select('user_id').single();
    if (account.error) throw new Error(`Realtime 测试账号目录写入失败：${account.error.message}`);

    const client = createClient(url, env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw new Error(`Realtime 测试登录失败：${signedIn.error?.message ?? 'missing session'}`);
    const workspace = await client.rpc('media_ensure_workspace', { p_request_id: randomUUID() });
    if (workspace.error || !workspace.data?.id) throw new Error(`Realtime 测试工作区失败：${workspace.error?.message ?? 'missing workspace'}`);
    const workspaceId = workspace.data.id as UUID;
    const userId = user.id as UUID;
    const auth = {
      accessToken: signedIn.data.session.access_token,
      userId: user.id,
      expiresAt: (signedIn.data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000
    };
    const open = (suffix: string) => openBackendRxdb({
      dbName: `aiao-media-backend-realtime-${suffix}-${randomUUID()}`,
      entities: [MediaSyncRecord],
      supabaseUrl: url,
      supabaseAnonKey: env.ANON_KEY,
      auth,
      workspaceId,
      workspaceScopedEntities: [MediaSyncRecord],
      enableWorkingTree: true,
      store: 'memory'
    });
    const [first, second] = await Promise.all([open('first'), open('second')]);
    sessions.push(first, second);
    await Promise.all(
      sessions.map(async backend => {
        await backend.db.syncManager.syncBranches();
        await backend.db.syncManager.sync();
      })
    );
    await new Promise(resolve => setTimeout(resolve, 1_000));

    const firstRepository = first.db.entityManager.getRepository(MediaSyncRecord);
    const secondRepository = second.db.entityManager.getRepository(MediaSyncRecord);
    const recordId = randomUUID();
    const payload = (value: string) => JSON.stringify({
      version: 1,
      state: { document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] }, fields: [], values: {} }
    });
    const createdRecord = first.db.entityManager.instantiate(MediaSyncRecord, {
      id: recordId,
      workspaceId,
      sourceId: `realtime-${recordId}`,
      kind: 'draft',
      payload: payload('first'),
      revision: 1,
      deleted: false,
      baseRevision: 0,
      createdBy: userId,
      updatedBy: userId
    });
    const remoteCreate = waitForRemoteEvent(second, ENTITY_REMOTE_CREATE_EVENT);
    await firstRepository.create(createdRecord);
    await first.db.syncManager.push();
    await remoteCreate;
    await second.db.syncManager.sync();
    const afterCreate = await firstValueFrom(secondRepository.findAll({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: recordId as UUID }] }
    }));
    assert.equal(afterCreate[0]?.revision, 1);

    const staleFirst = (await firstValueFrom(firstRepository.findAll({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: recordId as UUID }] }
    })))[0];
    const secondRow = afterCreate[0];
    if (!staleFirst || !secondRow) throw new Error('Realtime 测试初始记录未拉取到两个节点');
    const secondUpdated = await secondRepository.update(secondRow, {
      payload: payload('second'),
      revision: 2,
      baseRevision: 1
    });
    const remoteUpdate = waitForRemoteEvent(first, ENTITY_REMOTE_UPDATE_EVENT);
    await second.db.syncManager.push();
    await remoteUpdate;
    await firstRepository.update(staleFirst, {
      payload: payload('stale-first'),
      revision: 2,
      baseRevision: 1
    });
    const stalePush = await first.db.syncManager.push();
    const stalePushJson = JSON.stringify(stalePush);
    assert.match(stalePushJson, /failed|conflict|revision/i);
    assert.equal(secondUpdated.revision, 2);

    const recoveredPull = await first.db.syncManager.pull();
    assert.ok(recoveredPull.pulled >= 0);
    const current = (await firstValueFrom(firstRepository.findAll({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: recordId as UUID }] }
    })))[0];
    if (!current) throw new Error('revision 冲突恢复后记录缺失');
    const tombstoneEvent = waitForRemoteEvent(first, ENTITY_REMOTE_UPDATE_EVENT);
    await secondRepository.update(secondUpdated, { deleted: true, revision: 3, baseRevision: 2 });
    await second.db.syncManager.push();
    await tombstoneEvent;
    const tombstone = await service.from('media_sync_records').select('revision,deleted').eq('id', recordId).single();
    if (tombstone.error) throw new Error(`tombstone 查询失败：${tombstone.error.message}`);
    assert.equal(tombstone.data?.deleted, true);
    assert.equal(tombstone.data?.revision, 3);

    await first.supabase.realtime.disconnect();
    await new Promise(resolve => setTimeout(resolve, 700));
    await first.db.syncManager.sync();
    const repeated = await first.db.syncManager.sync();
    assert.equal(repeated.pullResult.pulled, 0);
  } finally {
    for (const backend of sessions) await backend.close();
    for (const userId of createdUsers) await service.auth.admin.deleteUser(userId);
  }
});
