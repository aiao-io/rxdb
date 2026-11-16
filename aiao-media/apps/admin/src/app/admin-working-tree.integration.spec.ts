import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { CommitChangeSetPage, CommitChangeUnitContent, CommitLogEntry } from '@aiao/rxdb-plugin-working-tree';
import { createAdminConfigProjection, type AdminConfigProjectionStore, type AdminWorkingTreeSource } from './admin-config-projection';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const authorId = '10000000-0000-4000-8000-000000000002';
const templateId = '10000000-0000-4000-8000-000000000003';
const commitId = '10000000-0000-4000-8000-000000000004';

const change: CommitChangeUnitContent = {
  unitId: '10000000-0000-4000-8000-000000000005',
  transactionId: null,
  namespace: 'public',
  entity: 'MediaPromptTemplate',
  entityId: templateId,
  operation: 'update',
  patch: { title: '新的模板' },
  inversePatch: { title: '旧模板', revision: 1 },
  origin: 'local'
};

const entry = (): CommitLogEntry => ({
  commitId,
  parentIds: [],
  firstParentId: null,
  kind: 'normal',
  message: '更新模板',
  authorId,
  createdAt: new Date('2026-11-15T07:00:00Z'),
  changeSetCount: 1
});

describe('Admin working-tree integration contract', () => {
  it('captures a commit event, projects it once, then survives a compensation scan', async () => {
    const commits$ = new Subject<{ commitId: string; branchId: string }>();
    let entries: readonly CommitLogEntry[] = [];
    const source: AdminWorkingTreeSource = {
      commits$,
      listCommits: async () => ({ branchId: 'main', entries }),
      commitChanges: async (): Promise<CommitChangeSetPage> => ({ commitId, entries: [change] })
    };
    const stored = new Set<string>();
    const synced: string[] = [];
    const store: AdminConfigProjectionStore = {
      hasCompleteProjection: async id => stored.has(id),
      save: async envelope => { stored.add(envelope.commit.id); }
    };
    const projection = createAdminConfigProjection({
      workingTree: source,
      workspaceId,
      authorId,
      store,
      readEntity: async () => ({ key: 'hero', title: '旧模板', prompt: 'prompt', revision: 1, enabled: true }),
      sync: async envelope => { synced.push(envelope.commit.id); }
    });

    await projection.start();
    entries = [entry()];
    commits$.next({ commitId, branchId: 'main' });
    await projection.idle();
    expect(synced).toEqual([commitId]);
    expect(stored).toContain(commitId);

    await projection.compensate();
    expect(synced).toEqual([commitId, commitId]);
    projection.stop();
  });
});
