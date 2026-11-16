import assert from 'node:assert/strict';
import { test } from 'vitest';
import { BackendConfigCommitCache, type BackendConfigCommitRemote } from './backend-config-commit.ts';

const commitId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '10000000-0000-4000-8000-000000000002';
const authorId = '10000000-0000-4000-8000-000000000003';
const operationId = '10000000-0000-4000-8000-000000000004';
const changeId = '10000000-0000-4000-8000-000000000005';

const remoteRows = (): { commit: Record<string, unknown>; changes: Record<string, unknown>[] } => ({
  commit: {
    id: commitId,
    workspaceId,
    branchId: 'main',
    parentIds: [],
    authorId,
    message: '后台同步配置',
    operationId,
    changeCount: 1,
    status: 'synced'
  },
  changes: [{
    id: changeId,
    workspaceId,
    commitId,
    sequence: 1,
    entity: 'MediaPromptTemplate',
    entityId: '10000000-0000-4000-8000-000000000006',
    operation: 'update',
    patch: { value: { key: 'hero', title: '新标题', prompt: '生成海报', purpose: null, style: null, tags: [], enabled: true } },
    inversePatch: { value: { key: 'hero', title: '旧标题' } },
    expectedRevision: 2,
    contentFingerprint: ''
  }]
});

async function validRemote(): Promise<BackendConfigCommitRemote> {
  const rows = remoteRows();
  const input = {
    id: commitId,
    workspaceId,
    branchId: 'main',
    parentIds: [],
    authorId,
    message: '后台同步配置',
    operationId,
    status: 'synced' as const,
    changes: [{
      id: changeId,
      sequence: 1,
      entity: 'MediaPromptTemplate',
      entityId: '10000000-0000-4000-8000-000000000006',
      operation: 'update' as const,
      patch: rows.changes[0]?.['patch'],
      inversePatch: rows.changes[0]?.['inversePatch'],
      expectedRevision: 2
    }]
  };
  const { createMediaConfigCommitEnvelope } = await import('@aiao-media/domain');
  const envelope = await createMediaConfigCommitEnvelope(input);
  rows.commit['contentFingerprint'] = envelope.commit.contentFingerprint;
  rows.changes[0]!['contentFingerprint'] = envelope.changes[0]!.contentFingerprint;
  return {
    readCommit: async () => rows.commit,
    readChanges: async () => rows.changes
  };
}

test('后台只缓存完整且 fingerprint 一致的配置 envelope', async () => {
  const cache = new BackendConfigCommitCache(await validRemote(), { workspaceId });
  const envelope = await cache.load(commitId);
  assert.equal(envelope.commit.id, commitId);
  assert.equal(envelope.commit.status, 'synced');
  assert.equal(envelope.changes.length, 1);
  assert.deepEqual(await cache.load(commitId), envelope);
});

test('后台节点拒绝不属于当前工作区的配置提交', async () => {
  const remote = await validRemote();
  await assert.rejects(
    () => new BackendConfigCommitCache(remote, { workspaceId: '10000000-0000-4000-8000-000000000099' }).load(commitId),
    /工作区/
  );
});

test('projection 未完整到达时拒绝缓存', async () => {
  const remote = await validRemote();
  const incomplete: BackendConfigCommitRemote = {
    ...remote,
    readChanges: async () => []
  };
  await assert.rejects(() => new BackendConfigCommitCache(incomplete).load(commitId), /不完整/);
});

test('fingerprint 不一致时拒绝缓存', async () => {
  const remote = await validRemote();
  const tampered: BackendConfigCommitRemote = {
    ...remote,
    readChanges: async id => {
      const rows = await remote.readChanges(id);
      return rows.map(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          throw new Error('测试数据无效。');
        }
        return { ...(row as Record<string, unknown>), contentFingerprint: '0'.repeat(64) };
      });
    }
  };
  await assert.rejects(() => new BackendConfigCommitCache(tampered).load(commitId), /fingerprint/);
});

test('变更行少于提交声明的数量时视为投影未到齐，不缓存也不放行应用', async () => {
  const remote = await validRemote();
  const rows = await remote.readChanges(commitId);
  const declared: BackendConfigCommitRemote = {
    readCommit: async id => ({ ...(await remote.readCommit(id) as Record<string, unknown>), changeCount: 2 }),
    readChanges: async () => rows
  };
  await assert.rejects(() => new BackendConfigCommitCache(declared).load(commitId), /未到齐/);
});

test('prepared 状态的提交还在补写变更，后台不加载', async () => {
  const remote = await validRemote();
  const prepared: BackendConfigCommitRemote = {
    ...remote,
    readCommit: async id => ({ ...(await remote.readCommit(id) as Record<string, unknown>), status: 'prepared' })
  };
  await assert.rejects(() => new BackendConfigCommitCache(prepared).load(commitId), /尚未同步/);
});
