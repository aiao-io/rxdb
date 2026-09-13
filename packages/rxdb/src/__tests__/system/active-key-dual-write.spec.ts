/**
 * @fileoverview `activated` / `activeKey` 双写不变式（FR-048，`system/branch.ts` 的列文档）
 *
 * @remarks
 * 「至多一个 active」那一半由 `RxDBBranch.activeKey` 的可空唯一列承担，而可空唯一列
 * 只在**非 NULL 的行**上生效。因此漏写一处 `activeKey` 不会报错，只会让那一行安静地
 * 退出唯一约束的管辖——schema 那一半的保护，正好是在这种漏写上失效的。
 *
 * 所以本文件按**写入点**而不是按功能组织：每一个会写 `activated` 的地方各占一条用例。
 * 新增写入点时这里必须同步长出一条，否则它就是下一个漏网的。
 */

import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_BRANCH_KEY } from '../../commit/active-branch-guard.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import type { LocalRxDBBranchRepository } from '../../system/types.local.js';
import { resolve_current_branch } from '../../version/resolve-current-branch.js';

/**
 * 造一个只认「按 `activated` 查」与「按 `id` 查」两种谓词的分支仓库桩。
 *
 * @param rows - 库里现有的分支行
 */
const createBranchRepository = (rows: Partial<InstanceType<typeof RxDBBranch>>[]) => {
  const update = vi.fn(async (entity: Record<string, unknown>, patch: Record<string, unknown>) =>
    Object.assign(entity, patch)
  );
  const create = vi.fn(async (entity: Record<string, unknown>) => entity);
  const find = vi.fn(async (query: { where: { rules: { field: string; value: unknown }[] } }) => {
    const [rule] = query.where.rules;
    return rows.filter(row => (row as Record<string, unknown>)[rule.field] === rule.value);
  });
  return { repository: { find, create, update } as unknown as LocalRxDBBranchRepository, find, create, update };
};

/** `resolve_current_branch` 只用 `rxdb.entityManager.instantiate`。 */
const createRxDBHost = () =>
  ({ entityManager: { instantiate: () => ({}) as InstanceType<typeof RxDBBranch> } }) as unknown as RxDB;

describe('activated / activeKey 双写', () => {
  it('resolve_current_branch 激活既有 main 时，patch 里必须带上哨兵键', async () => {
    const main = { id: 'main', activated: false, activeKey: null };
    const { repository, update } = createBranchRepository([main]);

    const branch = await resolve_current_branch(repository, createRxDBHost());

    expect(update).toHaveBeenCalledWith(main, { activated: true, activeKey: ACTIVE_BRANCH_KEY });
    // 返回值是调用方接着用的那个实例：只改库不改内存态，调用方手里的行就是旧的。
    expect(branch.activeKey).toBe(ACTIVE_BRANCH_KEY);
  });

  it('resolve_current_branch 新建 main 时，落库的行必须带上哨兵键', async () => {
    const { repository, create } = createBranchRepository([]);

    const branch = await resolve_current_branch(repository, createRxDBHost());

    expect(branch.activated).toBe(true);
    expect(branch.activeKey).toBe(ACTIVE_BRANCH_KEY);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: 'main', activeKey: ACTIVE_BRANCH_KEY }));
  });

  it('已有 active 分支时原样返回，不去改任何一行', async () => {
    const active = { id: 'feature-x', activated: true, activeKey: ACTIVE_BRANCH_KEY };
    const { repository, update, create } = createBranchRepository([active]);

    await expect(resolve_current_branch(repository, createRxDBHost())).resolves.toBe(active);

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
