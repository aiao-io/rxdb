import { RxDBChange } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncBranches } from '../sync-branches.js';
import { SyncManager } from '../SyncManager.js';

type BranchRepositoryMock = {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
type ChangeRepositoryMock = { find: ReturnType<typeof vi.fn> };
type RemoteAdapterMock = { pullBranches?: ReturnType<typeof vi.fn> };

/**
 * 本地已有的 `main`。
 *
 * 用例里的远端分支都挂在 `main` 下，而 `syncBranches` 现在按「父在前」落库（RXD-035），
 * 父找不到就整批放弃。所以 `find` 必须交出 `main` —— 这也是真实形态：
 * `getCurrentBranch` 保证本地永远有一个 `main`，远端分支挂空父才是不可能发生的。
 */
const LOCAL_MAIN = { id: 'main', remote: true };

describe('syncBranches', () => {
  let mockVersion: SyncManager;
  let mockBranchRepository: BranchRepositoryMock;
  let mockChangeRepository: ChangeRepositoryMock;
  let mockRemoteAdapter: RemoteAdapterMock;
  let pullBranchesMock: ReturnType<typeof vi.fn>;

  /**
   * 让远端 change id 一律翻译得出本地 id。
   *
   * `fromChangeId` 跨端必须翻译（见 `branch-change-id.ts`），默认给一个恒成功的对照表，
   * 单独验证「翻译不出来」的用例再自行覆盖。
   */
  const resolveRemoteChangeIds = (map: Record<number, number>) => {
    mockChangeRepository.find.mockImplementation(async (query: { where: { rules: Array<{ value: number }> } }) => {
      const remoteId = query.where.rules[0].value;
      const localId = map[remoteId];
      return localId === undefined ? [] : [{ id: localId, remoteId }];
    });
  };

  beforeEach(() => {
    mockBranchRepository = {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    };
    mockChangeRepository = { find: vi.fn().mockResolvedValue([]) };

    pullBranchesMock = vi.fn();
    mockRemoteAdapter = { pullBranches: pullBranchesMock };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        // 落库整段走事务，事务体内只能用 executor 作用域的仓库（RXD-035）。
        adapter: {
          transaction: (fun: (executor: unknown) => Promise<unknown>) =>
            fun({
              getRepository: (entity: unknown) => (entity === RxDBChange ? mockChangeRepository : mockBranchRepository)
            })
        }
      }),
      getRemoteRepositories: vi.fn().mockResolvedValue({
        adapter: mockRemoteAdapter
      })
    } as unknown as SyncManager;
  });

  it('should return empty result if pullBranches not implemented', async () => {
    mockRemoteAdapter.pullBranches = undefined;

    const result = await syncBranches(mockVersion);

    expect(result).toEqual({ created: 0, updated: 0, total: 0, skipped: [], skipReasons: {} });
  });

  it('should return empty result if no remote branches', async () => {
    pullBranchesMock.mockResolvedValue([]);

    const result = await syncBranches(mockVersion);

    expect(result).toEqual({ created: 0, updated: 0, total: 0, skipped: [], skipReasons: {} });
  });

  it('should create local entries for new remote branches', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: 'feature-a', fromChangeId: 10, parentId: 'main' },
      { id: 'feature-b', fromChangeId: 20, parentId: 'main' }
    ]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 10: 101, 20: 202 });

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.total).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('把远端 fromChangeId 翻译成本地 id 后才落库', async () => {
    // 远端 change id 与本地是两条独立自增序列，只有 RxDBChange.remoteId 把它们对上。
    // 原样写进本地分支行会让分叉点指向一条碰巧存在的无关变更，切分支时应用错误区间。
    pullBranchesMock.mockResolvedValue([{ id: 'feature-a', fromChangeId: 9042, parentId: 'main' }]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 9042: 17 });

    await syncBranches(mockVersion);

    expect(mockChangeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { combinator: 'and', rules: [{ field: 'remoteId', operator: '=', value: 9042 }] }
      })
    );
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ fromChangeId: 17 }));
  });

  it('分叉点变更还没拉到本地时跳过该分支，不写 null 也不写远端 id', async () => {
    // 写 null 会被 find-switch-branch-step 当"分叉于根"，从第一条变更起算；
    // 写远端 id 会被当本地 id 消费。两者都是静默损坏，唯一无损的选择是本轮跳过。
    pullBranchesMock.mockResolvedValue([
      { id: 'feature-a', fromChangeId: 9042, parentId: 'main' },
      { id: 'feature-b', fromChangeId: 9043, parentId: 'main' }
    ]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 9043: 18 });

    const result = await syncBranches(mockVersion);

    expect(result.skipped).toEqual(['feature-a']);
    expect(result.created).toBe(1);
    expect(mockBranchRepository.create).toHaveBeenCalledTimes(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'feature-b', fromChangeId: 18 })
    );
  });

  it('远端分叉点为空时照常落库，不去翻译', async () => {
    pullBranchesMock.mockResolvedValue([{ id: 'feature-root', fromChangeId: null, parentId: 'main' }]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);

    const result = await syncBranches(mockVersion);

    expect(mockChangeRepository.find).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ fromChangeId: null }));
    // 非 active 的行必须**显式**写 `activeKey: null`。留空字段在两个后端上都会落成
    // NULL，看起来一样——直到有人给这一列加默认值或改写入路径。写不写 `activated`
    // 与写不写 `activeKey` 必须是同一个决定，否则「同进同出」只是一句注释。
    expect(mockBranchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ activated: false, activeKey: null })
    );
  });

  it('should update remote flag for existing local branches', async () => {
    pullBranchesMock.mockResolvedValue([{ id: 'feature-a', fromChangeId: 10, parentId: 'main' }]);

    const localBranch = { id: 'feature-a', remote: false };
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN, localBranch]);

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockBranchRepository.update).toHaveBeenCalledWith(localBranch, expect.objectContaining({ remote: true }));
  });

  it('should skip branches already marked as remote', async () => {
    pullBranchesMock.mockResolvedValue([{ id: 'feature-a', fromChangeId: 10, parentId: 'main' }]);

    const localBranch = { id: 'feature-a', remote: true };
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN, localBranch]);

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockBranchRepository.update).not.toHaveBeenCalled();
  });

  // 远端分支行是**外来数据**，它的 id 没有经过本地那条创建路径。一条叫 `*active*` 的
  // 远端分支落进 `rxdb_branch.id` 就会与 active 哨兵同形，之后任何按「带不带 `*`」区分
  // 哨兵与用户数据的读者（含两个后端 `switch_branch` 的裸 SQL）都会读出两种答案。
  //
  // 跳过而不是整批放弃：`skipped` 这条通道本来就是为「这一行本轮落不了库，别的行照常」
  // 准备的。整批抛错会让一条坏的远端行把整个同步卡死，而本地这边一点办法都没有。
  it('跳过 id 含 active 哨兵保留字符的远端分支，其余照常创建', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: '*active*', fromChangeId: 1, parentId: 'main' },
      { id: 'feature-ok', fromChangeId: 2, parentId: 'main' }
    ]);

    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 1: 11, 2: 12 });

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(1);
    expect(result.skipped).toEqual(['*active*']);
    expect(mockBranchRepository.create).toHaveBeenCalledTimes(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'feature-ok' }));
  });

  // 坏分支被跳过后，它的子孙如果照常创建，会带着一个指向「本轮不存在的父」的 parentId ——
  // 真实落库时这是一条悬空外键，`PRAGMA defer_foreign_keys` 会在 COMMIT 才发现并回滚整个
  // 事务（连同本该成功的兄弟分支），且因为坏分支每轮都会被跳过，下一轮又会在同一个点上
  // 撞上同一个外键，永久卡死同步。这里的测试替身没有真实的 FK/回滚语义
  // （`mockVersion.getLocalRepositories().adapter.transaction` 只是
  // `(fun) => fun({getRepository: ...})`），复现不出真实 COMMIT 回滚，所以断言口径改为
  // 「create 从未带着悬空 parentId 被调用」—— 这是 COMMIT 回滚在仓库调用层面的等价、
  // 且可在测试替身里直接验证的后果。
  it('坏分支的子孙（含多代）连带跳过，不因悬空 parentId 尝试创建', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: '*active*', fromChangeId: 1, parentId: 'main' },
      { id: 'child-of-bad', fromChangeId: 2, parentId: '*active*' },
      { id: 'grandchild-of-bad', fromChangeId: 3, parentId: 'child-of-bad' },
      { id: 'sibling-ok', fromChangeId: 4, parentId: 'main' }
    ]);

    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 1: 11, 2: 12, 3: 13, 4: 14 });

    const result = await syncBranches(mockVersion);

    // 正常兄弟不受影响：父是 main，与坏分支的谱系无关。
    expect(result.created).toBe(1);
    expect(mockBranchRepository.create).toHaveBeenCalledTimes(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'sibling-ok' }));

    // 坏分支自己 + 两代后代，一个都不少地进 skipped，且顺序即处理顺序（父优先拓扑序）。
    expect(result.skipped).toEqual(['*active*', 'child-of-bad', 'grandchild-of-bad']);

    // create 从未被跟后代的 id 一起调用过 —— 不是「调用后失败」，是压根没调用。
    expect(mockBranchRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'child-of-bad' }));
    expect(mockBranchRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'grandchild-of-bad' }));

    // skipReasons 能看出原因是「祖先被跳过」，以及具体是哪一个祖先（直接父，不是根因）。
    expect(result.skipReasons['*active*']).toEqual({ cause: 'invalid-id' });
    expect(result.skipReasons['child-of-bad']).toEqual({ cause: 'ancestor-skipped', ancestorId: '*active*' });
    expect(result.skipReasons['grandchild-of-bad']).toEqual({
      cause: 'ancestor-skipped',
      ancestorId: 'child-of-bad'
    });
  });

  it('分叉点翻译失败的分支若带有子分支，子分支连带跳过，不因悬空 parentId 尝试创建', async () => {
    // 老的跳过通道（fromChangeId 翻译不出本地 id）有同样的潜在问题，只是它会随着分叉点
    // 变更被拉到本地而自愈，不像 id 不可用那样永久卡死；但级联跳过的逻辑不分渠道，
    // 这条通道也必须验证到。
    pullBranchesMock.mockResolvedValue([
      { id: 'untranslatable-parent', fromChangeId: 9042, parentId: 'main' },
      { id: 'child-of-untranslatable', fromChangeId: 2, parentId: 'untranslatable-parent' },
      { id: 'sibling-ok', fromChangeId: 3, parentId: 'main' }
    ]);

    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    // 9042 故意不进翻译表：模拟分叉点变更还没拉到本地。
    resolveRemoteChangeIds({ 2: 12, 3: 13 });

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(1);
    expect(mockBranchRepository.create).toHaveBeenCalledTimes(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'sibling-ok' }));

    expect(result.skipped).toEqual(['untranslatable-parent', 'child-of-untranslatable']);
    expect(result.skipReasons['untranslatable-parent']).toEqual({ cause: 'unresolved-from-change-id' });
    expect(result.skipReasons['child-of-untranslatable']).toEqual({
      cause: 'ancestor-skipped',
      ancestorId: 'untranslatable-parent'
    });
  });

  // `__proto__` 过得了 id 校验（只禁空串与 active 哨兵字符）。`skipReasons` 若是对象字面量逐键
  // 赋值，这一键会命中 `Object.prototype.__proto__` 的 setter——改写的是返回对象的原型，
  // 而不是添一个键：条目从 `Object.keys` / JSON 里消失，`cause` 反倒经原型链漏进 `for...in`。
  it('id 为 __proto__ 的远端分支被跳过时，skipReasons 照常记成自有键，不改写返回对象的原型', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: '__proto__', fromChangeId: 9042, parentId: 'main' },
      { id: 'child-of-proto', fromChangeId: 2, parentId: '__proto__' }
    ]);

    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    // 9042 故意不进翻译表，让 `__proto__` 走「分叉点翻译不出」跳过。
    resolveRemoteChangeIds({ 2: 12 });

    const result = await syncBranches(mockVersion);

    expect(result.skipped).toEqual(['__proto__', 'child-of-proto']);
    expect(Object.getPrototypeOf(result.skipReasons)).toBe(Object.prototype);
    expect(Object.keys(result.skipReasons)).toEqual(['__proto__', 'child-of-proto']);
    expect(Object.getOwnPropertyDescriptor(result.skipReasons, '__proto__')?.value).toEqual({
      cause: 'unresolved-from-change-id'
    });
    expect(result.skipReasons['child-of-proto']).toEqual({ cause: 'ancestor-skipped', ancestorId: '__proto__' });
  });

  it('should handle mixed scenario: new + existing + already-remote', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: 'remote-only', fromChangeId: 1, parentId: 'main' },
      { id: 'local-not-remote', fromChangeId: 2, parentId: 'main' },
      { id: 'already-synced', fromChangeId: 3, parentId: 'main' }
    ]);

    mockBranchRepository.find.mockResolvedValue([
      LOCAL_MAIN,
      { id: 'local-not-remote', remote: false },
      { id: 'already-synced', remote: true }
    ]);
    resolveRemoteChangeIds({ 1: 11 });

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.total).toBe(3);
  });
});
