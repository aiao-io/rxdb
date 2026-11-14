import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft } from './draft';
import { openDraftDatabase } from './draft-database';
import { makeStressDataset } from './stress-data';

const storage = vi.hoisted(() => ({
  current: 'main',
  bodies: new Map<string, string>(),
  status: vi.fn(),
  restore: vi.fn(),
  commitChanges: vi.fn(),
  commit: vi.fn(),
  listCommits: vi.fn(),
  createBranch: vi.fn(),
  enable: vi.fn(),
  enabled: true
}));
vi.mock('@aiao/rxdb-adapter-wa-sqlite', () => ({ RxDBAdapterWaSqlite: class {} }));
vi.mock('@aiao/rxdb', async original => {
  const actual = await original<typeof import('@aiao/rxdb')>();
  const { of } = await import('rxjs');
  return {
    ...actual,
    RxDB: class {
      use = vi.fn();
      adapter = vi.fn();
      connect = vi.fn(async () => undefined);
      disconnect = vi.fn(async () => undefined);
      entityManager = { instantiate: () => ({ body: '' }) };
      versionManager = { createBranch: storage.createBranch };
      workingTree = {
        isEnabled: async () => storage.enabled,
        enable: storage.enable,
        commit: storage.commit,
        listCommits: storage.listCommits,
        status: storage.status,
        restore: storage.restore,
        commitChanges: storage.commitChanges,
        checkouts: {
          list: async () => [
            { id: 'a', branchId: 'a', mode: 'writable' },
            { id: 'b', branchId: 'b', mode: 'writable' }
          ],
          mount: async (id: string) => {
            storage.current = id;
          },
          add: async () => ({ id: 'new' })
        }
      };
      get localAdapter$() {
        const branch = storage.current;
        const repository = {
          find: async () => (storage.bodies.has(branch) ? [{ body: storage.bodies.get(branch)! }] : []),
          update: async (_row: { body: string }, patch: { body: string }) => {
            storage.bodies.set(branch, patch.body);
          },
          create: async (row: { body: string }) => {
            storage.bodies.set(branch, row.body);
          }
        };
        return of({
          transaction: async <T>(run: (executor: { getRepository: () => typeof repository }) => Promise<T>) =>
            run({ getRepository: () => repository })
        });
      }
    }
  };
});

describe('工作树数据库检出位', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.bodies.clear();
    storage.current = 'main';
    storage.enabled = true;
    storage.status.mockResolvedValue({ branchId: 'a', activationRevision: 1, headRevision: 2, workingTreeRevision: 3 });
    storage.restore.mockResolvedValue({ ok: true, restoredCount: 1 });
    const data = makeStressDataset(4);
    storage.commitChanges.mockResolvedValue({
      entries: [
        { entity: 'DraftDocument', patch: { body: JSON.stringify(createDraft(data, data.structures.catalog)) } }
      ]
    });
  });

  it('新库启用提交能力，并建立持久的可写检出位', async () => {
    storage.enabled = false;
    const db = await openDraftDatabase('new');
    await db.mount('new-branch', '电池');
    expect(storage.enable).toHaveBeenCalledOnce();
    expect(storage.createBranch).toHaveBeenCalledWith('new-branch');
    expect(storage.current).toBe('new');
    expect(await db.read()).toBeUndefined();
  });

  it('提交使用真实提交身份和父节点，并携带三位并发凭证', async () => {
    const createdAt = new Date('2026-11-14T00:00:00Z');
    storage.commit.mockResolvedValue({ ok: true, commitId: 'actual' });
    storage.listCommits.mockResolvedValue({ entries: [{ commitId: 'actual', firstParentId: 'parent', createdAt }] });
    const db = await openDraftDatabase('test');
    await expect(db.commit('确认用量', 'request-1')).resolves.toEqual({
      id: 'actual',
      parentId: 'parent',
      createdAt: createdAt.toISOString()
    });
    expect(storage.commit).toHaveBeenCalledWith('确认用量', {
      authorId: 'local-engineer',
      operationId: 'request-1',
      expectedBranch: { branchId: 'a', activationRevision: 1 },
      expectedHeadRevision: 2,
      expectedWorkingTreeRevision: 3
    });
  });

  it('并发提交冲突不会重试或伪造成功结果', async () => {
    storage.commit.mockResolvedValueOnce({ ok: false });
    const db = await openDraftDatabase('test');
    await expect(db.commit('确认用量', 'request-1')).rejects.toThrow('工作树已被其他操作修改');
    expect(storage.commit).toHaveBeenCalledOnce();
    expect(storage.listCommits).not.toHaveBeenCalled();
  });

  it('提交落库后记录不可读时明确报错', async () => {
    storage.commit.mockResolvedValueOnce({ ok: true, commitId: 'actual' });
    storage.listCommits.mockResolvedValueOnce({ entries: [] });
    const db = await openDraftDatabase('test');
    await expect(db.commit('确认用量', 'request-1')).rejects.toThrow('提交成功但历史记录不可读取');
  });

  it('历史只显示用户提交，并取一次提交最后保存的完整草稿', async () => {
    const data = makeStressDataset(4);
    const draft = createDraft(data, data.structures.catalog);
    const createdAt = new Date('2026-11-14T00:00:00Z');
    storage.listCommits.mockResolvedValueOnce({
      headCommitId: 'actual',
      entries: [
        { kind: 'normal', commitId: 'actual', firstParentId: 'parent', createdAt, message: '确认用量' },
        { kind: 'branch_baseline', commitId: 'parent', firstParentId: null, createdAt, message: '' }
      ]
    });
    storage.status.mockResolvedValueOnce({ branchId: 'a', clean: false });
    storage.commitChanges.mockResolvedValueOnce({
      entries: [
        { entity: 'Other', patch: { body: '{}' } },
        { entity: 'DraftDocument', patch: { body: JSON.stringify(draft) } },
        { entity: 'DraftDocument', patch: { body: JSON.stringify({ ...draft, revision: 3 }) } }
      ]
    });
    const db = await openDraftDatabase(data.id);
    const history = await db.history();
    expect(history).toMatchObject({
      headCommitId: 'actual',
      dirty: true,
      commits: [
        {
          id: 'actual',
          parentId: 'parent',
          message: '确认用量',
          revision: 3,
          branchId: 'a',
          datasetId: data.id
        }
      ]
    });
    expect(history.commits).toHaveLength(1);
    expect(history.commits[0].draft.revision).toBe(3);
  });

  it('缺少草稿的提交无法恢复，业务数据和工作树条目都不改变', async () => {
    storage.commitChanges.mockResolvedValueOnce({ entries: [] });
    const db = await openDraftDatabase('test');
    await expect(db.restore('broken')).rejects.toThrow('提交记录缺少工作草稿内容');
    expect(storage.restore).not.toHaveBeenCalled();
  });

  it('恢复历史内容会写回业务文档，不能只恢复工作树条目', async () => {
    const data = makeStressDataset(4);
    const target = createDraft(data, data.structures.catalog);
    const db = await openDraftDatabase(data.id);
    await db.mount('a', '底盘');
    await db.save({ ...target, revision: 2 });
    storage.commitChanges.mockResolvedValue({
      entries: [
        { entity: 'DraftDocument', patch: { body: JSON.stringify({ ...target, revision: 1 }) } },
        { entity: 'DraftDocument', patch: { body: JSON.stringify(target) } }
      ]
    });
    await expect(db.restore('baseline')).resolves.toMatchObject({ revision: 0, nodes: target.nodes });
    expect(await db.read()).toMatchObject({ revision: 0, nodes: target.nodes });
    expect(storage.restore).toHaveBeenCalledWith(
      { commitId: 'baseline' },
      {
        expectedBranch: { branchId: 'a', activationRevision: 1 },
        expectedHeadRevision: 2,
        expectedWorkingTreeRevision: 3
      }
    );
  });

  it('恢复被拒绝时保留业务文档', async () => {
    const data = makeStressDataset(4);
    const target = createDraft(data, data.structures.catalog);
    const db = await openDraftDatabase(data.id);
    await db.mount('a', '底盘');
    await db.save({ ...target, revision: 2 });
    storage.restore.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    await expect(db.restore('baseline')).rejects.toThrow('版本恢复失败：conflict');
    expect((await db.read())?.revision).toBe(2);
  });
  it('每次读写都获取当前检出位的适配器，切换不会写回原来的表集', async () => {
    storage.bodies.clear();
    storage.current = 'main';
    const data = makeStressDataset(4);
    const draft = createDraft(data, data.structures.catalog);
    const db = await openDraftDatabase(data.id);
    await db.mount('a', '底盘');
    await db.save(draft);
    await db.mount('b', '电池');
    await db.save({ ...draft, revision: 2 });
    expect((await db.read())?.revision).toBe(2);
    await db.mount('a', '底盘');
    expect((await db.read())?.revision).toBe(0);
    expect(storage.bodies.has('main')).toBe(false);
  });
});
