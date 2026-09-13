/**
 * @fileoverview T027 红测试：active 分支基数不变量（FR-048）。
 *
 * @remarks
 * 实现目标是 `src/commit/active-branch-guard.ts`（T040）。
 *
 * FR-048 把「恰好一个」拆成两半，是因为**没有任何一半能单独成立**：
 *
 * - **至多一个**只有 schema 拦得住。运行期守卫再严，也只能在两行都写进去**之后**发现，
 *   而那时数据库已经处在它本该阻止的状态里——两个 Tab 各自 `switchBranch` 的竞态就是这么产生的。
 * - **至少一个**只有运行期拦得住。「没有 active 分支」是一张空表也满足的条件，
 *   任何列约束都表达不了。
 *
 * 另外三处容易写错的地方：
 *
 * 1. **零 active 的修复会被搬到连接路径上**。FR-048 把 main 恢复语义限定在**首次迁移**。
 *    每次连接都顺手修，意味着某个 Tab 的 `activated` 行因故消失时，用户被静默挪到 `main`：
 *    他的未提交条目还挂在 `feature-x` 上，界面却显示一个干净的空工作树。
 * 2. **多 active 会被 `limit: 1` 看漏**。既有 `resolve_current_branch`（`version/resolve-current-branch.ts`）
 *    的查询就带 `limit: 1`——直接复用它，两行 active 会被安静地读成一行，
 *    「按查询顺序猜一个」正是 spec 点名禁止的那种行为。
 * 3. **零 active 时会挑一个现成分支**。库里通常有 `feature-x`，挑它比建 `main` 更「聪明」，
 *    但那是在替用户做分支切换决定；恢复语义必须是确定的。
 *
 * 既然 schema 兜住了至多一个，为什么还要留多 active 的回滚路径？因为约束是在
 * 既有库上补的：迁移跑之前，那张表可能已经有两行 active。约束加不上去，
 * 得先让迁移认出来并整体回滚，而不是让建索引语句抛一个没有上下文的原生错误。
 */

import { describe, expect, it } from 'vitest';
import {
  ACTIVE_BRANCH_KEY,
  AmbiguousActiveBranchError,
  NoActiveBranchError,
  assertSingleActiveBranch,
  resolveSingleActiveBranch
} from '../../commit/active-branch-guard.js';
import { COMMIT_ERROR_CODES, CommitErrorCode, isCommitErrorCode } from '../../commit/commit-error-codes.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';

function createRxDB(): RxDB {
  const database = new RxDB({
    dbName: `rxdb-active-branch-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database;
}

interface BranchSpec {
  readonly id: string;
  readonly activated?: boolean;
}

interface Scene {
  readonly rxdb: RxDB;
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  branchIds(): string[];
  activeIds(): string[];
}

function createScene(branchSpecs: readonly BranchSpec[]): Scene {
  const rxdb = createRxDB();
  const probe = createCommitGraphProbe();

  probe.seed(
    RxDBBranch,
    branchSpecs.map(spec => {
      const branch = rxdb.entityManager.instantiate(RxDBBranch);
      branch.id = spec.id;
      branch.activated = spec.activated ?? false;
      branch.activeKey = spec.activated ? ACTIVE_BRANCH_KEY : null;
      branch.local = true;
      branch.remote = false;
      branch.parentId = null;
      branch.fromChangeId = null;
      return branch;
    })
  );

  const rows = () => probe.rowsOf(RxDBBranch) as RxDBBranch[];
  return {
    rxdb,
    probe,
    branchIds: () =>
      rows()
        .map(branch => branch.id)
        .sort(),
    activeIds: () =>
      rows()
        .filter(branch => branch.activated)
        .map(branch => branch.id)
        .sort()
  };
}

describe('首次迁移解析 active 分支（FR-048）', () => {
  it('已有一行 active 时原样返回它', async () => {
    const scene = createScene([{ id: 'main' }, { id: 'feature-x', activated: true }]);

    const branch = await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb);

    expect(branch.id).toBe('feature-x');
    expect(scene.activeIds()).toEqual(['feature-x']);
    expect(scene.branchIds()).toEqual(['feature-x', 'main']);
  });

  it('零 active 时激活既有 main，而不是再建一个', async () => {
    const scene = createScene([{ id: 'main' }, { id: 'feature-x' }]);

    const branch = await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb);

    expect(branch.id).toBe('main');
    expect(scene.activeIds()).toEqual(['main']);
    expect(scene.branchIds()).toEqual(['feature-x', 'main']);
  });

  it('零 active 且没有 main 时建一个 main', async () => {
    const scene = createScene([]);

    const branch = await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb);

    expect({ id: branch.id, activated: branch.activated, local: branch.local, remote: branch.remote }).toEqual({
      id: 'main',
      activated: true,
      local: true,
      remote: false
    });
    expect(scene.branchIds()).toEqual(['main']);
  });

  it('零 active 时不挑现成的分支顶上', async () => {
    const scene = createScene([{ id: 'feature-x' }, { id: 'feature-y' }]);

    const branch = await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb);

    // 挑 `feature-x` 是在替用户做一次分支切换；恢复语义必须是确定的。
    expect(branch.id).toBe('main');
    expect(scene.activeIds()).toEqual(['main']);
  });

  it('多 active 时抛 AmbiguousActiveBranchError', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'feature-x', activated: true }
    ]);

    // 直接复用带 `limit: 1` 的既有 `resolve_current_branch`，这里会安静地返回第一行。
    await expect(resolveSingleActiveBranch(scene.probe.executor, scene.rxdb)).rejects.toBeInstanceOf(
      AmbiguousActiveBranchError
    );
  });

  it('多 active 的错误带错误码与全部涉事分支 id', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'feature-x', activated: true },
      { id: 'feature-y' }
    ]);

    await expect(resolveSingleActiveBranch(scene.probe.executor, scene.rxdb)).rejects.toMatchObject({
      code: CommitErrorCode.ambiguous_active_branch,
      branchIds: ['feature-x', 'main']
    });
  });

  it('多 active 时一行都不改——守卫自己不「挑一个留下」', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'feature-x', activated: true }
    ]);

    await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb).catch(() => undefined);

    expect(scene.activeIds()).toEqual(['feature-x', 'main']);
    expect(scene.branchIds()).toEqual(['feature-x', 'main']);
  });
});

describe('连接时只验证，不修复（FR-048）', () => {
  it('恰好一行 active 时返回它', async () => {
    const scene = createScene([{ id: 'main' }, { id: 'feature-x', activated: true }]);

    await expect(assertSingleActiveBranch(scene.probe.executor)).resolves.toMatchObject({ id: 'feature-x' });
  });

  it('零 active 时抛 NoActiveBranchError，且不建 main', async () => {
    const scene = createScene([{ id: 'feature-x' }]);

    await expect(assertSingleActiveBranch(scene.probe.executor)).rejects.toBeInstanceOf(NoActiveBranchError);
    expect(scene.branchIds()).toEqual(['feature-x']);
    expect(scene.activeIds()).toEqual([]);
  });

  it('零 active 但 main 存在时同样抛错，不顺手激活它', async () => {
    const scene = createScene([{ id: 'main' }, { id: 'feature-x' }]);

    // 「有 main 就当没事」这条捷径把用户从 `feature-x` 静默挪到 `main`：
    // 未提交条目还挂在 `feature-x` 上，界面却显示一个干净的空工作树。
    await expect(assertSingleActiveBranch(scene.probe.executor)).rejects.toBeInstanceOf(NoActiveBranchError);
    expect(scene.activeIds()).toEqual([]);
  });

  it('多 active 时抛 AmbiguousActiveBranchError', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'feature-x', activated: true }
    ]);

    await expect(assertSingleActiveBranch(scene.probe.executor)).rejects.toBeInstanceOf(AmbiguousActiveBranchError);
  });

  it('它拿不到建分支的手段——签名本身就排除了修复', () => {
    // `resolveSingleActiveBranch` 需要 `rxdb` 才能 `instantiate`；验证器只收 executor。
    // 这不是风格问题：多一个参数，就多一条「顺手修一下」的路。
    expect(assertSingleActiveBranch).toHaveLength(1);
    expect(resolveSingleActiveBranch).toHaveLength(2);
  });
});

describe('至多一个 active 由 schema 兜底（FR-048）', () => {
  const activeKeyProperty = () =>
    getEntityMetadata(RxDBBranch).properties.find(property => property.name === 'activeKey');

  it('`RxDBBranch.activeKey` 是可空唯一列', () => {
    // 与 `WorkingTreeRestoreSession.activeKey` 同一套路：`NULL` 不参与唯一比较，
    // 于是「至多一行非 NULL」在 PostgreSQL 与全部 SQLite 绑定上语义一致，
    // 不需要各后端写方言化的部分索引。
    expect(activeKeyProperty()).toMatchObject({ unique: true, nullable: true });
  });

  it('它不是归一化唯一列', () => {
    // `normalized` 把每个 `NULL` 折成 `''` 参与比较，于是**非激活**分支互相冲突——
    // 库里将放不下第二个分支。
    expect(activeKeyProperty()).not.toMatchObject({ normalized: true });
  });

  it('哨兵值是常量，不是 branch id', () => {
    // 存 branch id 就成了第二份 active branch ID（data-model.md §2.2 明确禁止），
    // 而且唯一约束会退化成「每个分支至多激活一次」——两个分支同时 active 照样写得进去。
    expect(typeof ACTIVE_BRANCH_KEY).toBe('string');
    expect(ACTIVE_BRANCH_KEY.trim()).not.toBe('');
  });

  it('守卫写回的分支满足 activeKey 与 activated 同步', async () => {
    const scene = createScene([{ id: 'main' }]);

    const branch = await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb);

    // 冗余列就是第二份真相的温床（`Commit.firstParentId` 的 TSDoc 原话），
    // 所以每条写 `activated` 的路径都必须同步写 `activeKey`。
    expect({ activated: branch.activated, activeKey: branch.activeKey }).toEqual({
      activated: true,
      activeKey: ACTIVE_BRANCH_KEY
    });
  });

  it('新建 main 时也带上哨兵值', async () => {
    const scene = createScene([]);

    const branch = await resolveSingleActiveBranch(scene.probe.executor, scene.rxdb);

    expect(branch.activeKey).toBe(ACTIVE_BRANCH_KEY);
  });
});

describe('错误码登记（FR-048）', () => {
  it('`no_active_branch` 进 commit 错误码登记表', () => {
    // `commit-error-codes.ts` 的 TSDoc 要求未登记的码补进该模块，
    // 而不是在写路径上写成字面量。
    expect(CommitErrorCode.no_active_branch).toBe('no_active_branch');
    expect(COMMIT_ERROR_CODES).toContain('no_active_branch');
    expect(isCommitErrorCode('no_active_branch')).toBe(true);
  });

  it('两个错误都是带名字的 Error', async () => {
    const ambiguous = await resolveSingleActiveBranch(
      createScene([
        { id: 'a', activated: true },
        { id: 'b', activated: true }
      ]).probe.executor,
      createRxDB()
    ).catch((error: unknown) => error);
    const missing = await assertSingleActiveBranch(createScene([]).probe.executor).catch((error: unknown) => error);

    expect(ambiguous).toBeInstanceOf(Error);
    expect(missing).toBeInstanceOf(Error);
    expect({ ambiguous: (ambiguous as Error).name, missing: (missing as Error).name }).toEqual({
      ambiguous: 'AmbiguousActiveBranchError',
      missing: 'NoActiveBranchError'
    });
  });

  it('`NoActiveBranchError` 带 no_active_branch 码', async () => {
    await expect(assertSingleActiveBranch(createScene([]).probe.executor)).rejects.toMatchObject({
      code: CommitErrorCode.no_active_branch
    });
  });
});
