/**
 * @packageDocumentation
 * 分支仓库替身。
 *
 * US-025 阶段 C 之后，推拉的资格判定走核心的 `resolvePullIneligibility(rxdb, …)` /
 * `resolvePushIneligibility(rxdb, …)`，它们经 `getCurrentBranch(rxdb)` 真的去查一次
 * `activated = true` —— 替身再挂在 `VersionManager.getCurrentBranch()` 上已经拦不住了。
 *
 * 热路径必须答得出来：查不到激活分支时 `getCurrentBranch` 会掉进冷路径，开一次事务
 * 并在事务内 `update` / `create`，而各用例的适配器替身普遍没有这两个方法。
 */
import { RxDBBranch } from '@aiao/rxdb';
import { vi } from 'vitest';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** 从 `find` 的查询里取某个字段的规则值（只看顶层 `where.rules`，够用即可） */
const ruleValue = (query: unknown, field: string): unknown => {
  if (!isRecord(query) || !isRecord(query['where'])) return undefined;
  const rules = query['where']['rules'];
  if (!Array.isArray(rules)) return undefined;

  for (const rule of rules) {
    if (isRecord(rule) && rule['field'] === field) return rule['value'];
  }

  return undefined;
};

/** 造一个 {@link RxDBBranch} 实例（走原型，字段与真实实体同形） */
export const makeBranch = (id: string, parentId: string | null = null): RxDBBranch => {
  const branch = Object.create(RxDBBranch.prototype) as RxDBBranch;
  branch.id = id;
  branch.parentId = parentId;
  branch.activated = true;
  branch.local = true;
  branch.remote = false;
  return branch;
};

/**
 * 造一个只读的分支仓库替身，同时应付两种查询：
 *
 * - `activated = true` —— `getCurrentBranch()` 的热路径，答以 `currentBranchId`；
 * - `id = X` —— `getAncestorBranchIds()` 的逐级上溯，按 `parents` 回答，表里没有则空。
 *
 * @param currentBranchId - 当前分支 id，默认 `main`
 * @param parents - 分支 id 到父分支 id 的映射；默认只有一个无父的当前分支
 */
export const createBranchRepositoryStub = (currentBranchId = 'main', parents?: Record<string, string | null>) => {
  const branchParents = parents ?? { [currentBranchId]: null };

  const find = vi.fn(async (query: unknown): Promise<RxDBBranch[]> => {
    if (ruleValue(query, 'activated') === true) {
      return [makeBranch(currentBranchId, branchParents[currentBranchId] ?? null)];
    }

    const id = ruleValue(query, 'id');
    if (typeof id !== 'string' || !(id in branchParents)) return [];
    return [makeBranch(id, branchParents[id] ?? null)];
  });

  return { find };
};
