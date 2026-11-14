import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft } from './draft';
import { DraftVersionStore } from './draft-version-store';
import { createDraftBranch } from './draft-worktree';
import { makeStressDataset } from './stress-data';

const database = vi.hoisted(() => ({
  mount: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  commit: vi.fn(),
  restore: vi.fn()
}));
vi.mock('./draft-database', () => ({ openDraftDatabase: vi.fn(async () => database) }));

beforeEach(() => {
  vi.resetAllMocks();
  database.mount.mockResolvedValue(undefined);
  database.save.mockResolvedValue(undefined);
});

describe('RxDB 工作树操作编排', () => {
  const data = makeStressDataset(4);
  const draft = createDraft(data, data.structures.catalog);
  const branch = createDraftBranch(data, draft, '底盘');

  it('保存未完成时提交排队，不会在其他检出位上提交', async () => {
    let finish!: () => void;
    database.save.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    database.commit.mockResolvedValue({ id: 'real-commit', parentId: null, createdAt: '2026-11-14T00:00:00Z' });
    const store = new DraftVersionStore();
    const saving = store.save(branch, draft);
    const committing = store.commit(branch, '确认用量', 'request-1');
    await vi.waitFor(() => expect(database.save).toHaveBeenCalled());
    expect(database.commit).not.toHaveBeenCalled();
    finish();
    await saving;
    await expect(committing).resolves.toMatchObject({ id: 'real-commit' });
    expect(database.mount.mock.calls).toEqual([
      [branch.id, branch.name],
      [branch.id, branch.name]
    ]);
    expect(database.commit).toHaveBeenCalledWith('确认用量', 'request-1');
  });

  it('旧草稿只在新工作树为空时迁入，已有内容以 RxDB 为准', async () => {
    const store = new DraftVersionStore();
    database.read.mockResolvedValueOnce(undefined);
    await expect(store.read(branch, draft)).resolves.toEqual(draft);
    expect(database.save).toHaveBeenCalledWith(draft);
    const current = { ...draft, revision: 3 };
    database.read.mockResolvedValueOnce(current);
    await expect(store.read(branch, draft)).resolves.toBe(current);
    expect(database.save).toHaveBeenCalledTimes(1);
  });

  it('插件拒绝恢复时原样报告错误，后续操作仍可执行', async () => {
    const store = new DraftVersionStore();
    database.restore.mockRejectedValueOnce(new Error('工作树未提交'));
    await expect(store.restore(branch, 'old')).rejects.toThrow('工作树未提交');
    await expect(store.save(branch, draft)).resolves.toBeUndefined();
  });
});
