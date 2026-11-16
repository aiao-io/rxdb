import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type {
  CommitChangeSetPage,
  CommitChangeUnitContent,
  CommitLogEntry,
  WorkingTreeCommitEvent
} from '@aiao/rxdb-plugin-working-tree';
import {
  createAdminConfigProjection,
  createMediaConfigCommitEnvelopeFromWorkingTree,
  type AdminConfigProjectionStore,
  type AdminWorkingTreeSource
} from './admin-config-projection';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const authorId = '10000000-0000-4000-8000-000000000002';
const commitId = '10000000-0000-4000-8000-000000000003';
const templateId = '10000000-0000-4000-8000-000000000004';
const policyId = '10000000-0000-4000-8000-000000000005';

const commitEntry: CommitLogEntry = {
  commitId,
  parentIds: [],
  firstParentId: null,
  kind: 'normal',
  message: '更新媒体配置',
  authorId,
  createdAt: new Date('2026-11-15T02:00:00.000Z'),
  changeSetCount: 2
};

const unit = (overrides: Partial<CommitChangeUnitContent>): CommitChangeUnitContent => ({
  unitId: '10000000-0000-4000-8000-000000000006',
  transactionId: null,
  namespace: 'public',
  entity: 'MediaPromptTemplate',
  entityId: templateId,
  operation: 'update',
  patch: { title: '新标题' },
  inversePatch: { title: '旧标题', revision: 2 },
  origin: 'local',
  ...overrides
});

const source = (changes: readonly CommitChangeUnitContent[]): AdminWorkingTreeSource => ({
  commits$: new Subject<WorkingTreeCommitEvent>(),
  listCommits: async () => ({ branchId: 'main', headCommitId: commitId, entries: [{ ...commitEntry, changeSetCount: changes.length }] }),
  commitChanges: async (): Promise<CommitChangeSetPage> => ({ commitId, entries: changes })
});

describe('Admin 配置提交投影', () => {
  it('把工作树字段 patch 投影成完整配置 envelope，并稳定生成 operationId', async () => {
    const envelope = await createMediaConfigCommitEnvelopeFromWorkingTree(source([
      unit({}),
      unit({
        unitId: '10000000-0000-4000-8000-000000000007',
        entity: 'MediaProviderPolicy',
        entityId: policyId,
        operation: 'insert',
        patch: { providers: [{ id: 'p1' }], enabled: true },
        inversePatch: null
      })
    ]), {
      commitId,
      workspaceId,
      authorId,
      readEntity: async (entity, entityId) => {
        if (entity === 'MediaPromptTemplate' && entityId === templateId) {
          return {
            id: templateId,
            workspaceId,
            branchId: 'main',
            revision: 2,
            key: 'hero',
            title: '新标题',
            prompt: '生成海报',
            purpose: null,
            style: 'cinematic',
            tags: ['media'],
            enabled: true
          };
        }
        return {
          id: policyId,
          workspaceId,
          branchId: 'main',
          revision: 1,
          key: 'default',
          version: 1,
          providers: [{ id: 'p1' }],
          enabled: true
        };
      }
    });

    expect(envelope.commit.id).toBe(commitId);
    expect(envelope.commit.operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(envelope.commit.status).toBe('prepared');
    expect(envelope.changes).toHaveLength(2);
    expect(envelope.changes[0]).toMatchObject({
      entity: 'MediaPromptTemplate',
      expectedRevision: 2,
      patch: {
        value: {
          key: 'hero',
          title: '新标题',
          prompt: '生成海报',
          tags: ['media']
        }
      }
    });
    expect(envelope.changes[0]?.patch).not.toHaveProperty('value.id');
    expect(envelope.changes[1]).toMatchObject({
      entity: 'MediaProviderPolicy',
      operation: 'insert',
      expectedRevision: null,
      patch: { value: { key: 'default', providers: [{ id: 'p1' }] } }
    });

    const retry = await createMediaConfigCommitEnvelopeFromWorkingTree(source([
      unit({}),
      unit({
        unitId: '10000000-0000-4000-8000-000000000007',
        entity: 'MediaProviderPolicy',
        entityId: policyId,
        operation: 'insert',
        patch: { providers: [{ id: 'p1' }], enabled: true },
        inversePatch: null
      })
    ]), {
      commitId,
      workspaceId,
      authorId,
      readEntity: async (entity, entityId) => entityId === templateId
        ? { id: entityId, workspaceId, branchId: 'main', revision: 2, key: 'hero', title: '新标题', prompt: '生成海报', purpose: null, style: 'cinematic', tags: ['media'], enabled: true }
        : { id: entityId, workspaceId, branchId: 'main', revision: 1, key: 'default', version: 1, providers: [{ id: 'p1' }], enabled: true }
    });
    expect(retry.commit.operationId).toBe(envelope.commit.operationId);
    expect(retry.commit.contentFingerprint).toBe(envelope.commit.contentFingerprint);
    expect(retry.changes.map(change => change.contentFingerprint)).toEqual(
      envelope.changes.map(change => change.contentFingerprint)
    );
  });

  it('拒绝系统实体和未注册媒体实体进入领域 projection', async () => {
    await expect(createMediaConfigCommitEnvelopeFromWorkingTree(source([
      unit({ entity: 'Commit', namespace: 'rxdb' })
    ]), {
      commitId,
      workspaceId,
      authorId,
      readEntity: async () => ({})
    })).rejects.toThrow('不允许投影');
  });

  it('删除使用逆向 patch 中的 revision 作为 CAS 预期值', async () => {
    const envelope = await createMediaConfigCommitEnvelopeFromWorkingTree(source([
      unit({
        operation: 'delete',
        patch: null,
        inversePatch: { key: 'hero', revision: 7 }
      })
    ]), {
      commitId,
      workspaceId,
      authorId,
      readEntity: async () => null
    });

    expect(envelope.changes[0]).toMatchObject({
      operation: 'delete',
      expectedRevision: 7,
      patch: { value: null }
    });
  });

  it('父提交跳过工作树系统基线，只指向已投影的配置提交，合并保留全部父链', async () => {
    const baseline = '20000000-0000-4000-8000-000000000001';
    const first = '20000000-0000-4000-8000-000000000002';
    const second = '20000000-0000-4000-8000-000000000003';
    const branchBaseline = '20000000-0000-4000-8000-000000000004';
    const branchCommit = '20000000-0000-4000-8000-000000000005';
    const merge = '20000000-0000-4000-8000-000000000006';
    const node = (id: string, parentIds: string[], kind: CommitLogEntry['kind'] = 'normal'): CommitLogEntry => ({
      ...commitEntry,
      commitId: id,
      parentIds,
      firstParentId: parentIds[0] ?? null,
      kind,
      changeSetCount: kind === 'normal' ? 1 : 0
    });
    const entries = [
      node(merge, [second, branchCommit]),
      node(branchCommit, [branchBaseline]),
      node(branchBaseline, [first], 'branch_baseline'),
      node(second, [first]),
      node(first, [baseline]),
      node(baseline, [], 'baseline')
    ];
    const history: AdminWorkingTreeSource = {
      commits$: new Subject<WorkingTreeCommitEvent>(),
      listCommits: async () => ({ branchId: 'main', headCommitId: merge, entries }),
      commitChanges: async id => ({ commitId: id, entries: [unit({ unitId: id })] })
    };
    const project = (id: string) => createMediaConfigCommitEnvelopeFromWorkingTree(history, {
      commitId: id,
      workspaceId,
      authorId,
      readEntity: async () => ({ id: templateId, workspaceId, revision: 2, key: 'hero', title: '标题', prompt: 'p', tags: [], enabled: true })
    });

    expect((await project(first)).commit.parentIds).toEqual([]);
    expect((await project(second)).commit.parentIds).toEqual([first]);
    expect((await project(branchCommit)).commit.parentIds).toEqual([first]);
    expect((await project(merge)).commit.parentIds).toEqual([second, branchCommit]);
  });

  it('父提交不在可达历史里时拒绝投影，不猜测祖先', async () => {
    const orphan: AdminWorkingTreeSource = {
      commits$: new Subject<WorkingTreeCommitEvent>(),
      listCommits: async () => ({
        branchId: 'main',
        headCommitId: commitId,
        entries: [{ ...commitEntry, parentIds: ['30000000-0000-4000-8000-000000000001'], changeSetCount: 1 }]
      }),
      commitChanges: async () => ({ commitId, entries: [unit({})] })
    };
    await expect(createMediaConfigCommitEnvelopeFromWorkingTree(orphan, {
      commitId,
      workspaceId,
      authorId,
      readEntity: async () => ({ id: templateId, workspaceId, revision: 2, key: 'hero', title: '标题', prompt: 'p', tags: [], enabled: true })
    })).rejects.toThrow('父提交');
  });

  it('监听提交并通过补偿扫描，保证同一提交只持久化一次', async () => {
    const commits$ = new Subject<WorkingTreeCommitEvent>();
    const workingTree: AdminWorkingTreeSource = {
      commits$,
      listCommits: async () => ({ branchId: 'main', headCommitId: commitId, entries: [{ ...commitEntry, changeSetCount: 1 }] }),
      commitChanges: async () => ({ commitId, entries: [unit({})] })
    };
    const persisted: string[] = [];
    const store: AdminConfigProjectionStore = {
      hasCompleteProjection: async id => persisted.includes(id),
      save: async envelope => {
        persisted.push(envelope.commit.id);
      }
    };
    const projection = createAdminConfigProjection({
      workingTree,
      workspaceId,
      authorId,
      store,
      readEntity: async () => ({ id: templateId, workspaceId, branchId: 'main', revision: 2, key: 'hero', title: '新标题', prompt: '生成海报', purpose: null, style: null, tags: [], enabled: true })
    });

    await projection.start();
    commits$.next({ commitId, branchId: 'main' });
    await projection.idle();
    await projection.compensate();

    expect(persisted).toEqual([commitId]);
    projection.stop();
  });
});
