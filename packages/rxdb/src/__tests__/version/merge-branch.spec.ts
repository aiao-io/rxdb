import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';
import { merge_branch } from '../../version/merge-branch.js';
import { VersionManager } from '../../version/VersionManager.js';
import { createTransactionExecutorStub } from '../fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type MergeAdapterMock = {
  mergeChanges: ReturnType<typeof vi.fn>;
  removeMany: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

const changeKey = (entity: string, entityId: string) => `public:${entity}:${getRxDBEntityIdentityKey(entityId)}`;

describe('merge_branch', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: FindRepositoryMock;
  let mockChangeRepository: FindRepositoryMock;
  let mockAdapter: MergeAdapterMock;

  beforeEach(() => {
    mockBranchRepository = {
      find: vi.fn()
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    mockAdapter = {
      mergeChanges: vi.fn().mockResolvedValue(undefined),
      removeMany: vi.fn().mockResolvedValue(undefined),
      // 默认直通：不额外制造事务语义，只记录调用。
      // C2 起回调收到 executor，替身把 mergeChanges 转发回本 mock 适配器。
      transaction: vi.fn(async (fun: (executor: never) => Promise<unknown>) =>
        fun(
          createTransactionExecutorStub({
            // `remove_branch`（deleteSource 走的那条）现在也在事务里读写，
            // 所以这里不能再返回 undefined —— 转发回本用例的仓库与 removeMany。
            getRepository: (EntityType: EntityType) =>
              (EntityType as unknown) === RxDBBranch ? mockBranchRepository : mockChangeRepository,
            mergeChanges: mockAdapter.mergeChanges as never,
            removeMany: mockAdapter.removeMany as never
          }) as never
        )
      )
    };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter: mockAdapter
      }),
      getCurrentBranch: vi.fn()
    } as unknown as VersionManager;
  });

  // ============================================
  // 错误场景
  // ============================================

  it('should throw error when merging branch into itself', async () => {
    await expect(merge_branch(mockVersion, 'main', 'main')).rejects.toThrow(RxDBError);
    await expect(merge_branch(mockVersion, 'main', 'main')).rejects.toThrow("Cannot merge branch 'main' into itself");
  });

  it('should throw error when source branch does not exist', async () => {
    mockBranchRepository.find.mockResolvedValue([]);

    await expect(merge_branch(mockVersion, 'non-existent', 'main')).rejects.toThrow(RxDBError);
    await expect(merge_branch(mockVersion, 'non-existent', 'main')).rejects.toThrow("Branch 'non-existent' not found");
  });

  // ============================================
  // change 边界（RXD-050 复核）
  // ============================================
  //
  // 评审 RXD-050 主张「fromChangeId 是父分支的 change id，却拿去过滤子分支自己的 id，
  // 两套 id 序列没有可比性」。核对后该前提不成立：`RxDBChange.id` 是 `rxdb_change` 表上
  // 单一的 integer primary 全局自增（`getRxDBChangeSequence` 读 `sqlite_sequence` 亦印证），
  // 全库只有**一条** id 序列。因此分叉点的全局 id 与子分支自己的 id 完全可比：
  // 子分支的变更都在分叉之后创建，其 id 必然大于 fromChangeId。
  //
  // 这里按评审自己建议的「父/子 id 序列交错」场景固化该边界，防止日后误改成按分支独立计数。
  describe('分叉边界：单一全局 id 序列下按 id > fromChangeId 过滤', () => {
    it('查询条件同时限定 branchId 与 id > fromChangeId', async () => {
      mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
      mockChangeRepository.find.mockResolvedValue([]);

      await merge_branch(mockVersion, 'feature', 'main');

      const query = mockChangeRepository.find.mock.calls[0]?.[0] as {
        where: { rules: { field: string; operator: string; value: unknown }[] };
      };
      expect(query.where.rules).toEqual(
        expect.arrayContaining([
          { field: 'branchId', operator: '=', value: 'feature' },
          { field: 'id', operator: '>', value: 5 }
        ])
      );
    });

    it('父子 id 交错时只合并分叉后的子分支变更', async () => {
      // 全局序列：#5 父（分叉点）→ #6 子 → #7 父 → #8 子
      // 仓库层按 branchId + id > 5 过滤，落到 merge 的只应是 #6 / #8
      mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
      mockChangeRepository.find.mockResolvedValue([
        { id: 6, branchId: 'feature', namespace: 'public', entity: 'Item', entityId: 'a', type: 'INSERT', patch: {} },
        { id: 8, branchId: 'feature', namespace: 'public', entity: 'Item', entityId: 'b', type: 'INSERT', patch: {} }
      ]);

      const result = await merge_branch(mockVersion, 'feature', 'main');

      expect(result.merged).toBe(2);
      const query = mockChangeRepository.find.mock.calls[0]?.[0] as {
        where: { rules: { field: string; operator: string; value: unknown }[] };
      };
      // 不得退化成「只按 branchId 查」——那会把分叉前的历史一起重放
      expect(query.where.rules).toEqual(expect.arrayContaining([{ field: 'id', operator: '>', value: 5 }]));
    });

    it('fromChangeId 为 null（根分支）时不加 id 边界', async () => {
      mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: null, parentId: null }]);
      mockChangeRepository.find.mockResolvedValue([]);

      await merge_branch(mockVersion, 'feature', 'main');

      const query = mockChangeRepository.find.mock.calls[0]?.[0] as {
        where: { rules: { field: string; operator: string }[] };
      };
      expect(query.where.rules.some(rule => rule.field === 'id')).toBe(false);
    });
  });

  // ============================================
  // 空分支
  // ============================================

  it('should return merged=0 for empty branch', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result).toEqual({ merged: 0, strategy: 'squash', sourceDeleted: false });
    expect(mockAdapter.mergeChanges).not.toHaveBeenCalled();
  });

  it('should delete source branch even when empty if deleteSource=true', async () => {
    mockBranchRepository.find
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main' }])
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main', activated: false }])
      .mockResolvedValueOnce([]);
    mockChangeRepository.find
      .mockResolvedValueOnce([]) // sourceChanges: empty
      .mockResolvedValueOnce([]); // remove_branch: branchChanges

    const result = await merge_branch(mockVersion, 'feature', 'main', { deleteSource: true });

    expect(result.merged).toBe(0);
    expect(result.sourceDeleted).toBe(true);
    expect(mockAdapter.removeMany).toHaveBeenCalled();
  });

  // ============================================
  // Squash merge（默认）
  // ============================================

  it('should squash merge single INSERT change', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Test' },
        inversePatch: null,
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result.merged).toBe(1);
    expect(result.strategy).toBe('squash');
    expect(result.sourceDeleted).toBe(false);
    expect(mockAdapter.mergeChanges).toHaveBeenCalledTimes(1);

    const [actions] = mockAdapter.mergeChanges.mock.calls[0];
    expect(actions.inserts.size).toBe(1);
    expect(actions.inserts.get(changeKey('Todo', 'todo-1'))).toEqual({
      patch: { title: 'Test' },
      inversePatch: null
    });
  });

  it('should squash merge INSERT + UPDATE into single INSERT', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Draft' },
        inversePatch: null,
        revertChangeId: null
      },
      {
        id: 7,
        branchId: 'feature',
        type: 'UPDATE',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Final' },
        inversePatch: { title: 'Draft' },
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result.merged).toBe(1);
    const [actions] = mockAdapter.mergeChanges.mock.calls[0];
    expect(actions.inserts.size).toBe(1);
    expect(actions.updates.size).toBe(0);
    expect(actions.inserts.get(changeKey('Todo', 'todo-1'))!.patch).toEqual({ title: 'Final' });
  });

  it('should squash merge INSERT + DELETE into a DELETE action', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Test' },
        inversePatch: null,
        revertChangeId: null
      },
      {
        id: 7,
        branchId: 'feature',
        type: 'DELETE',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: null,
        inversePatch: { title: 'Test' },
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    // squash 过滤幽灵删除：源分支内 INSERT+DELETE 对目标分支无净贡献
    expect(result.merged).toBe(0);
    expect(mockAdapter.mergeChanges).not.toHaveBeenCalled();
  });

  it('should squash merge phantom delete with deleteSource still deletes source', async () => {
    mockBranchRepository.find
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main' }])
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main', activated: false }])
      .mockResolvedValueOnce([]);
    mockChangeRepository.find
      .mockResolvedValueOnce([
        {
          id: 6,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'Todo',
          entityId: 'todo-1',
          patch: { title: 'Test' },
          inversePatch: null,
          revertChangeId: null
        },
        {
          id: 7,
          branchId: 'feature',
          type: 'DELETE',
          namespace: 'public',
          entity: 'Todo',
          entityId: 'todo-1',
          patch: null,
          inversePatch: { title: 'Test' },
          revertChangeId: null
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await merge_branch(mockVersion, 'feature', 'main', { deleteSource: true });

    expect(result.merged).toBe(0);
    expect(result.sourceDeleted).toBe(true);
    expect(mockAdapter.removeMany).toHaveBeenCalled();
  });

  it('should squash merge multiple entities', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 0, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 1,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Todo 1' },
        inversePatch: null,
        revertChangeId: null
      },
      {
        id: 2,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'User',
        entityId: 'user-1',
        patch: { name: 'Alice' },
        inversePatch: null,
        revertChangeId: null
      },
      {
        id: 3,
        branchId: 'feature',
        type: 'UPDATE',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Updated Todo 1' },
        inversePatch: { title: 'Todo 1' },
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result.merged).toBe(2);
    const [actions] = mockAdapter.mergeChanges.mock.calls[0];
    expect(actions.inserts.size).toBe(2);
    expect(actions.inserts.get(changeKey('Todo', 'todo-1'))!.patch).toEqual({ title: 'Updated Todo 1' });
    expect(actions.inserts.get(changeKey('User', 'user-1'))!.patch).toEqual({ name: 'Alice' });
  });

  // ============================================
  // 普通合并。
  // ============================================

  it('should normal merge with same compressed result', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Test' },
        inversePatch: null,
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main', { strategy: 'normal' });

    expect(result.merged).toBe(1);
    expect(result.strategy).toBe('normal');
    expect(mockAdapter.mergeChanges).toHaveBeenCalledTimes(1);
  });

  it('should normal merge call mergeChanges once per source change', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Draft' },
        inversePatch: null,
        revertChangeId: null
      },
      {
        id: 7,
        branchId: 'feature',
        type: 'UPDATE',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Final' },
        inversePatch: { title: 'Draft' },
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main', { strategy: 'normal' });

    // normal: 每条变更单独调用 mergeChanges，不压缩
    expect(result.merged).toBe(2);
    expect(mockAdapter.mergeChanges).toHaveBeenCalledTimes(2);
    // 第一次调用：INSERT
    const [actions1] = mockAdapter.mergeChanges.mock.calls[0];
    expect(actions1.inserts.size).toBe(1);
    expect(actions1.updates.size).toBe(0);
    // 第二次调用：UPDATE
    const [actions2] = mockAdapter.mergeChanges.mock.calls[1];
    expect(actions2.updates.size).toBe(1);
    expect(actions2.inserts.size).toBe(0);
  });

  // ============================================
  // 原子性
  // ============================================

  /**
   * normal 策略逐条调用 mergeChanges，每次调用各自是一个事务，但整个循环没有边界：
   * 第 k 条失败时前 k-1 条已落库，且触发器已在目标分支生成对应 RxDBChange。
   * 必须把整个循环包进一个事务，让失败真正回到合并前。
   */
  it('normal 策略的每次 mergeChanges 都必须在同一个事务内', async () => {
    const changes = [6, 7, 8].map(id => ({
      id,
      branchId: 'feature',
      type: 'INSERT' as const,
      namespace: 'public',
      entity: 'Todo',
      entityId: `todo-${id}`,
      patch: { title: `T${id}` },
      inversePatch: null,
      revertChangeId: null
    }));
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue(changes);

    let depth = 0;
    const depthAtEachMerge: number[] = [];
    mockAdapter.transaction.mockImplementation(async (fun: (executor: never) => Promise<unknown>) => {
      depth++;
      try {
        return await fun(
          createTransactionExecutorStub({
            getRepository: () => undefined,
            mergeChanges: mockAdapter.mergeChanges as never
          }) as never
        );
      } finally {
        depth--;
      }
    });
    mockAdapter.mergeChanges.mockImplementation(async () => {
      depthAtEachMerge.push(depth);
    });

    await merge_branch(mockVersion, 'feature', 'main', { strategy: 'normal' });

    expect(depthAtEachMerge).toEqual([1, 1, 1]);
    expect(mockAdapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('normal 策略中途失败时，事务体向外抛错以触发回滚', async () => {
    const changes = [6, 7].map(id => ({
      id,
      branchId: 'feature',
      type: 'INSERT' as const,
      namespace: 'public',
      entity: 'Todo',
      entityId: `todo-${id}`,
      patch: { title: `T${id}` },
      inversePatch: null,
      revertChangeId: null
    }));
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue(changes);

    const boom = new Error('merge exploded');
    mockAdapter.transaction.mockImplementation(async (fun: (executor: never) => Promise<unknown>) =>
      fun(
        createTransactionExecutorStub({
          getRepository: () => undefined,
          mergeChanges: mockAdapter.mergeChanges as never
        }) as never
      )
    );
    let call = 0;
    mockAdapter.mergeChanges.mockImplementation(async () => {
      call++;
      if (call === 2) throw boom;
    });

    await expect(merge_branch(mockVersion, 'feature', 'main', { strategy: 'normal' })).rejects.toBe(boom);
    // 失败必须穿透事务体，否则适配器不会 ROLLBACK
    expect(mockAdapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('squash 策略只有一次 mergeChanges，不额外包事务', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Draft' },
        inversePatch: null,
        revertChangeId: null
      }
    ]);

    await merge_branch(mockVersion, 'feature', 'main', { strategy: 'squash' });

    // 单次 mergeChanges 在适配器内部已经是一个事务，再包一层是多余的嵌套
    expect(mockAdapter.mergeChanges).toHaveBeenCalledTimes(1);
    expect(mockAdapter.transaction).not.toHaveBeenCalled();
  });

  // ============================================
  // deleteSource 选项
  // ============================================

  it('should delete source branch when deleteSource=true', async () => {
    // 第一次调用：merge_branch 内部查源分支
    // 第二次调用：remove_branch 内部查源分支
    // 第三次调用：remove_branch 查子分支
    mockBranchRepository.find
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main', activated: false }])
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main', activated: false }])
      .mockResolvedValueOnce([]);
    mockChangeRepository.find
      .mockResolvedValueOnce([
        {
          id: 6,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'Todo',
          entityId: 'todo-1',
          patch: { title: 'Test' },
          inversePatch: null,
          revertChangeId: null
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await merge_branch(mockVersion, 'feature', 'main', { deleteSource: true });

    expect(result.sourceDeleted).toBe(true);
    expect(mockAdapter.removeMany).toHaveBeenCalled();
  });

  /**
   * 删源分支是合并成功之后的收尾动作，失败不该把已落库的合并一起判死：
   * 调用方收到异常会以为没合并而重试 —— normal 策略下就是二次合并。
   */
  it('删除源分支失败不得吞掉已成功的合并', async () => {
    mockBranchRepository.find
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main', activated: false }])
      .mockResolvedValueOnce([{ id: 'feature', fromChangeId: 5, parentId: 'main', activated: false }])
      // remove_branch 查子分支：有子分支 → 拒绝删除
      .mockResolvedValueOnce([{ id: 'child', fromChangeId: 6, parentId: 'feature' }]);
    mockChangeRepository.find
      .mockResolvedValueOnce([
        {
          id: 6,
          branchId: 'feature',
          type: 'INSERT',
          namespace: 'public',
          entity: 'Todo',
          entityId: 'todo-1',
          patch: { title: 'Test' },
          inversePatch: null,
          revertChangeId: null
        }
      ])
      // remove_branch 查该分支的变更：非空才会触发子分支检查
      .mockResolvedValueOnce([{ id: 6, branchId: 'feature' }]);

    const result = await merge_branch(mockVersion, 'feature', 'main', { deleteSource: true });

    // 合并成果必须如实返回
    expect(result.merged).toBe(1);
    expect(mockAdapter.mergeChanges).toHaveBeenCalled();
    // 删除失败如实标记，并把原因交给调用方
    expect(result.sourceDeleted).toBe(false);
    expect(result.sourceDeleteError).toBeInstanceOf(Error);
  });

  it('should not delete source branch by default', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result.sourceDeleted).toBe(false);
    expect(mockAdapter.removeMany).not.toHaveBeenCalled();
  });

  // ============================================
  // fromChangeId 为 null 的分支
  // ============================================

  it('should handle source branch without fromChangeId', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: null, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 1,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Test' },
        inversePatch: null,
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result.merged).toBe(1);

    // 验证查询不包含 id > 的条件（因为 fromChangeId 为 null）
    expect(mockChangeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          combinator: 'and',
          rules: [
            { field: 'branchId', operator: '=', value: 'feature' },
            { field: 'revertChangeId', operator: '=', value: null }
          ]
        }
      })
    );
  });

  // ============================================
  // disableTriggers 参数
  // ============================================

  it('should call mergeChanges with disableTriggers=false', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'INSERT',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: { title: 'Test' },
        inversePatch: null,
        revertChangeId: null
      }
    ]);

    await merge_branch(mockVersion, 'feature', 'main');

    expect(mockAdapter.mergeChanges).toHaveBeenCalledWith(expect.any(Object), undefined, false);
  });

  // ============================================
  // DELETE 变更
  // ============================================

  it('should merge DELETE changes correctly', async () => {
    mockBranchRepository.find.mockResolvedValue([{ id: 'feature', fromChangeId: 5, parentId: 'main' }]);
    mockChangeRepository.find.mockResolvedValue([
      {
        id: 6,
        branchId: 'feature',
        type: 'DELETE',
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1',
        patch: null,
        inversePatch: { title: 'Old todo' },
        revertChangeId: null
      }
    ]);

    const result = await merge_branch(mockVersion, 'feature', 'main');

    expect(result.merged).toBe(1);
    const [actions] = mockAdapter.mergeChanges.mock.calls[0];
    expect(actions.deletes.size).toBe(1);
    expect(actions.deletes.get(changeKey('Todo', 'todo-1'))).toEqual({
      patch: null,
      inversePatch: { title: 'Old todo' }
    });
  });
});
