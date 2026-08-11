import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';
import { RxDBChange } from '../../system/change.js';
import { get_switch_version_actions, switch_branch_actions } from '../../version/switch-branch-actions.js';
import { VersionManager } from '../../version/VersionManager.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };

/**
 * 辅助函数：创建空的 SwitchVersionActions
 */
const emptyActions = () => ({
  deletes: new Map(),
  updates: new Map(),
  inserts: new Map()
});

const USER_KEY = `public:User:${getRxDBEntityIdentityKey('user-1')}`;

describe('switch_branch_actions', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: FindRepositoryMock;
  let mockChangeRepository: FindRepositoryMock;

  beforeEach(() => {
    mockBranchRepository = {
      find: vi.fn()
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository
      })
    } as unknown as VersionManager;
  });

  it('should throw error if current branch not found', async () => {
    mockBranchRepository.find.mockResolvedValue([]);

    await expect(switch_branch_actions(mockVersion, 'branch1')).rejects.toThrow(RxDBError);
    await expect(switch_branch_actions(mockVersion, 'branch1')).rejects.toThrow('Current branch not found');
  });

  it('should throw error if target branch not found', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'main', activated: true }]);

    await expect(switch_branch_actions(mockVersion, 'non-existent')).rejects.toThrow(RxDBError);
    await expect(switch_branch_actions(mockVersion, 'non-existent')).rejects.toThrow('Branch (non-existent) not found');
  });

  it('should throw error when switching to the same branch', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'main', activated: true }]);

    await expect(switch_branch_actions(mockVersion, 'main')).rejects.toThrow(RxDBError);
    await expect(switch_branch_actions(mockVersion, 'main')).rejects.toThrow('Cannot switch to the same branch');
  });

  it('uses the active-query match when cached activated fields are stale', async () => {
    const main = { id: 'main', activated: true, fromChangeId: null, parentId: null };
    const feature = { id: 'feature', activated: false, fromChangeId: null, parentId: 'main' };
    mockBranchRepository.find.mockResolvedValueOnce([feature]).mockResolvedValueOnce([main, feature]);
    mockChangeRepository.find.mockResolvedValue([]);

    await expect(switch_branch_actions(mockVersion, 'main')).resolves.toEqual(emptyActions());
  });

  it('should return empty actions when switching between empty branches', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: null, parentId: null }
    ]);

    mockChangeRepository.find.mockResolvedValue([]);

    const actions = await switch_branch_actions(mockVersion, 'feature');

    expect(actions).toEqual(emptyActions());
  });

  it('should handle INSERT changes when switching branches forward', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: null, parentId: 'main' }
    ]);

    // 第一次调用：获取当前分支的最大变更。
    // 第二次调用：获取目标分支的最大变更。
    // 第三次调用：获取切换所需的变更。
    mockChangeRepository.find
      .mockResolvedValueOnce([]) // 当前分支没有变更
      .mockResolvedValueOnce([{ id: 10, branchId: 'feature' }]) // feature 分支的最大变更
      .mockResolvedValueOnce([
        {
          id: 5,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          revertChangeId: null
        }
      ]);

    const actions = await switch_branch_actions(mockVersion, 'feature');

    expect(actions.inserts.size).toBe(1);
    expect(actions.inserts.get(USER_KEY)).toEqual({
      patch: { id: 'user-1', name: 'John' },
      inversePatch: null
    });
    expect(actions.deletes.size).toBe(0);
    expect(actions.updates.size).toBe(0);
  });

  it('should handle UPDATE changes when switching branches', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: null, parentId: 'main' }
    ]);

    // 设置模拟对象处理所有 find 调用。
    let callCount = 0;
    mockChangeRepository.find.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ id: 5, branchId: 'main' }]); // 当前分支的 get_branch_max_change
      if (callCount === 2) return Promise.resolve([{ id: 10, branchId: 'feature' }]); // 目标分支的 get_branch_max_change
      // 获取切换所需的变更。
      return Promise.resolve([
        {
          id: 8,
          branchId: 'feature',
          type: 'UPDATE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { name: 'Jane' },
          inversePatch: { name: 'John' },
          revertChangeId: null
        }
      ]);
    });

    const actions = await switch_branch_actions(mockVersion, 'feature');

    expect(actions.updates.size).toBe(1);
    const updateChange = actions.updates.get(USER_KEY);
    expect(updateChange?.patch).toEqual({ name: 'Jane' });
    expect(actions.inserts.size).toBe(0);
    expect(actions.deletes.size).toBe(0);
  });

  it('should handle DELETE changes when switching branches', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: null, parentId: 'main' }
    ]);

    let callCount = 0;
    mockChangeRepository.find.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ id: 5, branchId: 'main' }]);
      if (callCount === 2) return Promise.resolve([{ id: 10, branchId: 'feature' }]);
      return Promise.resolve([
        {
          id: 8,
          branchId: 'feature',
          type: 'DELETE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: null,
          revertChangeId: null
        }
      ]);
    });

    const actions = await switch_branch_actions(mockVersion, 'feature');

    expect(actions.deletes.size).toBe(1);
    const deleteChange = actions.deletes.get(USER_KEY);
    expect(deleteChange).toBeDefined();
    expect(deleteChange?.patch).toBeNull();
    expect(actions.inserts.size).toBe(0);
    expect(actions.updates.size).toBe(0);
  });

  it('should handle inverse patch when switching backwards', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'feature', activated: true, fromChangeId: null, parentId: null },
      { id: 'main', activated: false, fromChangeId: null, parentId: null }
    ]);

    let callCount = 0;
    mockChangeRepository.find.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ id: 10, branchId: 'feature' }]);
      if (callCount === 2) return Promise.resolve([{ id: 5, branchId: 'main' }]);
      return Promise.resolve([
        {
          id: 8,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          inversePatch: null,
          revertChangeId: null
        }
      ]);
    });

    const actions = await switch_branch_actions(mockVersion, 'main');

    expect(actions.deletes.size).toBe(1);
    const deleteChange = actions.deletes.get(USER_KEY);
    expect(deleteChange).toBeDefined();
    expect(deleteChange?.inversePatch).toEqual({ id: 'user-1', name: 'John' });
  });

  it('should handle multiple changes in correct order', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: null, parentId: 'main' }
    ]);

    mockChangeRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 15, branchId: 'feature' }])
      .mockResolvedValueOnce([
        {
          id: 5,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          revertChangeId: null
        },
        {
          id: 10,
          branchId: 'feature',
          type: 'UPDATE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { name: 'Jane' },
          inversePatch: { name: 'John' },
          revertChangeId: null
        },
        {
          id: 15,
          branchId: 'feature',
          type: 'DELETE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: null,
          revertChangeId: null
        }
      ]);

    const actions = await switch_branch_actions(mockVersion, 'feature');

    // INSERT、UPDATE、DELETE 序列完成后，实体应位于 deletes 中。
    expect(actions.deletes.size).toBe(1);
    const deleteChange = actions.deletes.get(USER_KEY);
    expect(deleteChange).toBeDefined();
    expect(actions.inserts.size).toBe(0);
    expect(actions.updates.size).toBe(0);
  });

  it('should merge multiple UPDATE changes', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: null, parentId: 'main' }
    ]);

    mockChangeRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 15, branchId: 'feature' }])
      .mockResolvedValueOnce([
        {
          id: 5,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { id: 'user-1', name: 'John', age: 20 },
          revertChangeId: null
        },
        {
          id: 10,
          branchId: 'feature',
          type: 'UPDATE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { name: 'Jane' },
          inversePatch: { name: 'John' },
          revertChangeId: null
        },
        {
          id: 15,
          branchId: 'feature',
          type: 'UPDATE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { age: 25 },
          inversePatch: { age: 20 },
          revertChangeId: null
        }
      ]);

    const actions = await switch_branch_actions(mockVersion, 'feature');

    // 多次更新应合并到 insert 中。
    expect(actions.inserts.size).toBe(1);
    const insertChange = actions.inserts.get(USER_KEY);
    expect(insertChange?.patch).toEqual({
      id: 'user-1',
      name: 'Jane',
      age: 25
    });
    // inversePatch 应该包含被更新字段的原始值（来自 INSERT 和 UPDATE 的 inversePatch）
    expect(insertChange?.inversePatch).toEqual({
      name: 'John',
      age: 20
    });
  });

  it('should handle inverse UPDATE with inversePatch', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'feature', activated: true, fromChangeId: null, parentId: null },
      { id: 'main', activated: false, fromChangeId: null, parentId: null }
    ]);

    mockChangeRepository.find
      .mockResolvedValueOnce([{ id: 10, branchId: 'feature' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 8,
          branchId: 'feature',
          type: 'UPDATE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { name: 'Jane' },
          inversePatch: { name: 'John' },
          revertChangeId: null
        }
      ]);

    const actions = await switch_branch_actions(mockVersion, 'main');

    expect(actions.updates.size).toBe(1);
    const updateChange = actions.updates.get(USER_KEY);
    expect(updateChange?.patch).toEqual({ name: 'John' });
  });

  it('should handle inverse DELETE with inversePatch', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'feature', activated: true, fromChangeId: null, parentId: null },
      { id: 'main', activated: false, fromChangeId: null, parentId: null }
    ]);

    mockChangeRepository.find
      .mockResolvedValueOnce([{ id: 10, branchId: 'feature' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 8,
          branchId: 'feature',
          type: 'DELETE',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: null,
          inversePatch: { id: 'user-1', name: 'John' },
          revertChangeId: null
        }
      ]);

    const actions = await switch_branch_actions(mockVersion, 'main');

    expect(actions.inserts.size).toBe(1);
    const insertChange = actions.inserts.get(USER_KEY);
    expect(insertChange?.patch).toEqual({ id: 'user-1', name: 'John' });
    expect(insertChange?.inversePatch).toBeNull();
  });

  it('should handle branch with fromChangeId', async () => {
    mockBranchRepository.find.mockResolvedValue([
      { id: 'main', activated: true, fromChangeId: null, parentId: null },
      { id: 'feature', activated: false, fromChangeId: 5, parentId: 'main' }
    ]);

    let callCount = 0;
    mockChangeRepository.find.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ id: 10, branchId: 'main' }]);
      if (callCount === 2) return Promise.resolve([{ id: 15, branchId: 'feature' }]);
      return Promise.resolve([
        {
          id: 12,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'User',
          entityId: 'user-1',
          patch: { id: 'user-1', name: 'John' },
          revertChangeId: null
        }
      ]);
    });

    const actions = await switch_branch_actions(mockVersion, 'feature');

    expect(actions.inserts.size).toBe(1);
    const insertChange = actions.inserts.get(USER_KEY);
    expect(insertChange?.patch).toEqual({ id: 'user-1', name: 'John' });
    expect(insertChange?.inversePatch).toBeNull();
  });
});

/**
 * 逆向分支（undo / 回退切分支）的两条不变量。
 *
 * 正向分支已经守住这两条（浅拷贝 + 同时查 inserts/updates），逆向分支曾经漏掉：
 * changes 里的 patch / inversePatch 可能是 EntityManager 的缓存实例，
 * actions 一旦持有引用，后续 Object.assign 合并就会原地改写源数据。
 */
describe('get_switch_version_actions（逆向分支）', () => {
  const change = (input: Partial<RxDBChange> & Pick<RxDBChange, 'id' | 'type'>): RxDBChange =>
    ({
      namespace: 'public',
      entity: 'User',
      entityId: 'user-1',
      branchId: 'feature',
      revertChangeId: null,
      patch: null,
      inversePatch: null,
      ...input
    }) as RxDBChange;

  it('不得持有源 change 的 patch / inversePatch 引用', () => {
    const insert = change({ id: 5, type: 'INSERT', patch: { id: 'user-1', name: 'John' } });
    const update = change({ id: 8, type: 'UPDATE', patch: { name: 'Jane' }, inversePatch: { name: 'John' } });
    const remove = change({ id: 10, type: 'DELETE', inversePatch: { id: 'user-1', name: 'Jane' } });

    const actions = get_switch_version_actions([insert, update, remove], false);

    // INSERT 的逆向落在 deletes，DELETE 的逆向落在 inserts
    expect(actions.deletes.get(USER_KEY)?.inversePatch).not.toBe(insert.patch);
    expect(actions.inserts.get(USER_KEY)?.patch).not.toBe(remove.inversePatch);
  });

  it('合并逆向 UPDATE 时不得原地改写源 change', () => {
    const older = change({ id: 8, type: 'UPDATE', patch: { name: 'Jane' }, inversePatch: { name: 'John' } });
    const newer = change({ id: 10, type: 'UPDATE', patch: { age: 25 }, inversePatch: { age: 20 } });

    get_switch_version_actions([older, newer], false);

    // 源 change 必须逐字保持原样，否则 RxDBChange 缓存实例被污染
    expect(newer.patch).toEqual({ age: 25 });
    expect(newer.inversePatch).toEqual({ age: 20 });
    expect(older.patch).toEqual({ name: 'Jane' });
    expect(older.inversePatch).toEqual({ name: 'John' });
  });

  it('逆向 UPDATE 命中已有 inserts 条目时应合并进去，而非同时落进 updates', () => {
    // 逆向按 id 降序处理：先 DELETE(10) → 撤销删除 = 重新插入；再 UPDATE(8) → 撤销更新
    // 同一实体只能有一个终态，落进两张表会让适配器先 INSERT 再 UPDATE，或直接冲突
    const update = change({ id: 8, type: 'UPDATE', patch: { name: 'Jane' }, inversePatch: { name: 'John' } });
    const remove = change({ id: 10, type: 'DELETE', inversePatch: { id: 'user-1', name: 'Jane' } });

    const actions = get_switch_version_actions([update, remove], false);

    expect(actions.updates.size).toBe(0);
    expect(actions.inserts.size).toBe(1);
    // 重新插入的行要带上被撤销的那次更新的原值
    expect(actions.inserts.get(USER_KEY)?.patch).toEqual({ id: 'user-1', name: 'John' });
  });
});
