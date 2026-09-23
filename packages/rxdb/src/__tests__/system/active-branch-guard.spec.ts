/**
 * @fileoverview active 分支的基数不变量（FR-048，`system/active-branch-guard.ts`）
 *
 * @remarks
 * 「恰好一个」由 schema 与运行期各担一半，本文件只管运行期那一半。两个入口的区别
 * **不是严格程度，是时点**：`resolveSingleActiveBranch` 只给首次启用迁移用，零 active
 * 属于正常状态、可以恢复；`assertSingleActiveBranch` 给运行期用，零 active 一律拒绝。
 *
 * 因此用例按「零 / 一 / 多」三种基数 × 两个入口铺开：共识部分（多行一律拒、一行原样返回）
 * 必须两侧一致，分歧只准出现在零行那一格。漏掉任何一格，两个入口就会各自长出一份答案。
 */

import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '../../entity/entity-manager.js';
import {
  ACTIVE_BRANCH_KEY,
  type ActiveBranchEntityHost,
  AmbiguousActiveBranchError,
  assertSingleActiveBranch,
  NoActiveBranchError,
  resolveSingleActiveBranch
} from '../../system/active-branch-guard.js';
import { RxDBBranch } from '../../system/branch.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';

type BranchRow = Partial<RxDBBranch>;

/**
 * 造一个只认「按 `activated` 查」与「按 `id` 查」两种谓词的分支仓库 + 事务执行器。
 *
 * @param rows - 库里现有的分支行
 *
 * @remarks
 * `find` 刻意**不**实现 `limit`：守卫的查询一律不带 `limit`（基数本身就是要判定的东西），
 * 桩里补一个 `limit` 语义等于替被测代码把答案截断，多 active 的用例会安静地变绿。
 */
const createExecutor = (rows: BranchRow[]) => {
  const update = vi.fn(async (entity: BranchRow, patch: BranchRow) => Object.assign(entity, patch));
  const create = vi.fn(async (entity: BranchRow) => entity);
  const find = vi.fn(async (query: { where: { rules: { field: string; value: unknown }[] } }) => {
    const [rule] = query.where.rules;
    return rows.filter(row => (row as Record<string, unknown>)[rule.field] === rule.value);
  });
  const getRepository = vi.fn(() => ({ find, create, update }));
  return { executor: { getRepository } as unknown as TransactionExecutor, find, create, update };
};

/** `activateMainBranch` 只用 `host.entityManager.instantiate` */
const createHost = (): ActiveBranchEntityHost =>
  ({ entityManager: { instantiate: () => ({}) as RxDBBranch } }) as unknown as { entityManager: EntityManager };

const activeRow = (id: string): BranchRow => ({ id, activated: true, activeKey: ACTIVE_BRANCH_KEY });

describe('assertSingleActiveBranch', () => {
  it('恰好一行 active 时原样返回那一行', async () => {
    const active = activeRow('feature-x');
    const { executor, update, create } = createExecutor([active, { id: 'main', activated: false, activeKey: null }]);

    await expect(assertSingleActiveBranch(executor)).resolves.toBe(active);

    // 它不修复任何东西：一行都不该被写
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('零 active 时抛 NoActiveBranchError —— 即使 main 就在库里也不顺手激活', async () => {
    const { executor, update, create } = createExecutor([{ id: 'main', activated: false, activeKey: null }]);

    await expect(assertSingleActiveBranch(executor)).rejects.toBeInstanceOf(NoActiveBranchError);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('多行 active 时抛 AmbiguousActiveBranchError，不挑一个留下', async () => {
    const { executor, update } = createExecutor([activeRow('feature-x'), activeRow('main')]);

    await expect(assertSingleActiveBranch(executor)).rejects.toBeInstanceOf(AmbiguousActiveBranchError);
    expect(update).not.toHaveBeenCalled();
  });

  it('查询不带 limit：基数本身就是要判定的东西', async () => {
    const { executor, find } = createExecutor([activeRow('feature-x')]);

    await assertSingleActiveBranch(executor);

    const [query] = find.mock.calls[0];
    expect(query).not.toHaveProperty('limit');
    expect(query.where.rules).toEqual([{ field: 'activated', operator: '=', value: true }]);
  });
});

describe('resolveSingleActiveBranch', () => {
  it('恰好一行 active 时原样返回，不走恢复路径', async () => {
    const active = activeRow('feature-x');
    const { executor, update, create } = createExecutor([active]);

    await expect(resolveSingleActiveBranch(executor, createHost())).resolves.toBe(active);

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('零 active 且 main 已存在：激活它，并且 activated / activeKey 必须同时写', async () => {
    const main: BranchRow = { id: 'main', activated: false, activeKey: null };
    const { executor, update, create } = createExecutor([main]);

    const branch = await resolveSingleActiveBranch(executor, createHost());

    expect(update).toHaveBeenCalledWith(main, { activated: true, activeKey: ACTIVE_BRANCH_KEY });
    expect(create).not.toHaveBeenCalled();
    expect(branch.activeKey).toBe(ACTIVE_BRANCH_KEY);
  });

  it('零 active 且 main 不存在：新建它，落库的行同样带哨兵键', async () => {
    const { executor, create, update } = createExecutor([]);

    const branch = await resolveSingleActiveBranch(executor, createHost());

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'main', activated: true, activeKey: ACTIVE_BRANCH_KEY, local: true, remote: false })
    );
    expect(branch.id).toBe('main');
  });

  it('多行 active 时与运行期入口口径一致：抛错且一行都不改，由调用方回滚整条迁移', async () => {
    const { executor, update, create } = createExecutor([activeRow('feature-x'), activeRow('main')]);

    await expect(resolveSingleActiveBranch(executor, createHost())).rejects.toBeInstanceOf(AmbiguousActiveBranchError);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('守卫错误', () => {
  it('AmbiguousActiveBranchError 带上全部 active 分支 id，且已按字典序排好', async () => {
    const { executor } = createExecutor([activeRow('zeta'), activeRow('alpha'), activeRow('main')]);

    const error = await assertSingleActiveBranch(executor).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AmbiguousActiveBranchError);
    expect((error as AmbiguousActiveBranchError).branchIds).toEqual(['alpha', 'main', 'zeta']);
    expect((error as AmbiguousActiveBranchError).code).toBe('ambiguous_active_branch');
    expect((error as Error).name).toBe('AmbiguousActiveBranchError');
    expect((error as Error).message).toContain('found 3: alpha, main, zeta');
  });

  it('NoActiveBranchError 的码与名字是稳定契约', () => {
    const error = new NoActiveBranchError();

    expect(error.code).toBe('no_active_branch');
    expect(error.name).toBe('NoActiveBranchError');
    expect(error.message).toBe('Exactly one branch must be active, found none.');
  });

  it('两个错误都能被 instanceof 认出 —— 跨 ES5 继承边界的原型修复是它们的前提', () => {
    expect(new AmbiguousActiveBranchError(['a', 'b'])).toBeInstanceOf(AmbiguousActiveBranchError);
    expect(new NoActiveBranchError()).toBeInstanceOf(NoActiveBranchError);
  });

  it('哨兵键不是分支 id：它含有不合法的命名字符，不可能与任何分支撞上', () => {
    expect(ACTIVE_BRANCH_KEY).toBe('*active*');
  });
});
