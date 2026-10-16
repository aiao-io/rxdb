import { getRxDBEntityIdentityKey, type RxDBBranch, type RxDBChange } from '@aiao/rxdb';
import type { SwitchBranchActionReaders } from '../../switch-branch-actions.js';

/** 夹具里的实体都挂在这一个命名空间与实体名下。 */
export const MEMORY_NAMESPACE = 'public';
export const MEMORY_ENTITY = 'Todo';

/** 一行实体：键是字段名。 */
export type MemoryRow = Record<string, unknown>;

/** 夹具里一条变更行用到的字段。 */
interface MemoryChange {
  readonly id: number;
  readonly branchId: string;
  readonly type: 'INSERT' | 'UPDATE' | 'DELETE';
  readonly namespace: string;
  readonly entity: string;
  readonly entityId: string;
  readonly patch: MemoryRow | null;
  readonly inversePatch: MemoryRow | null;
  /** 撤销只改这一列（{@link MemoryBranchHistory.revert}），所以它不是只读的 */
  revertChangeId: number | null;
}

/** 夹具里一条分支行用到的字段。 */
interface MemoryBranch {
  readonly id: string;
  readonly parentId: string | null;
  readonly fromChangeId: number | null;
  activated: boolean;
}

interface QueryRule {
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

interface QueryOptions {
  readonly where: { readonly rules: readonly QueryRule[] };
  readonly orderBy?: readonly { readonly field: string; readonly sort: 'asc' | 'desc' }[];
  readonly limit?: number;
}

/** 只认本插件查询里出现过的几种运算符；`= null` 即「为空」。 */
const matches = (row: Record<string, unknown>, rule: QueryRule): boolean => {
  const value = row[rule.field] ?? null;
  switch (rule.operator) {
    case '=':
      return value === rule.value;
    case '>':
      return (value as number) > (rule.value as number);
    case '>=':
      return (value as number) >= (rule.value as number);
    case '<':
      return (value as number) < (rule.value as number);
    case '<=':
      return (value as number) <= (rule.value as number);
    default:
      throw new Error(`夹具不认识运算符 ${rule.operator}`);
  }
};

/** 按查询选项从内存行里取：过滤、排序、截断。 */
const query = <T extends object>(rows: readonly T[], options: QueryOptions): T[] => {
  const hit = rows.filter(row => options.where.rules.every(rule => matches(row as Record<string, unknown>, rule)));
  const order = options.orderBy?.[0];
  if (order) {
    const sign = order.sort === 'desc' ? -1 : 1;
    hit.sort(
      (a, b) =>
        sign *
        (((a as Record<string, unknown>)[order.field] as number) -
          ((b as Record<string, unknown>)[order.field] as number))
    );
  }
  return options.limit === undefined ? hit : hit.slice(0, options.limit);
};

/**
 * 手写一段分支历史，并按 `rxdb_change` / `rxdb_branch` 的查询规则求值的只读仓库。
 *
 * @remarks
 * 变更行的补丁按「分支当时的真实状态」生成：UPDATE 的反向补丁取改之前的值，DELETE 的反向补丁是整行。
 * {@link stateOf} 重放出任意分支在任意变更点的真实数据，是对比与预览用例的判定基准——
 * 断言写成「结果等于两侧真实状态之差」，而不是再手抄一遍期望。
 */
export class MemoryBranchHistory {
  readonly #branches: MemoryBranch[] = [];
  readonly #changes: MemoryChange[] = [];
  #nextChangeId = 1;

  constructor(rootBranchId = 'main') {
    this.#branches.push({ id: rootBranchId, parentId: null, fromChangeId: null, activated: true });
  }

  /**
   * 从父分支的某个变更点建一条分支。
   *
   * @param id - 分支 id
   * @param parentId - 父分支
   * @param fromChangeId - 分叉点；缺省为父分支当前的 tip（父分支一条自有变更都没有时为它自己的分叉点）
   */
  branch(id: string, parentId: string, fromChangeId?: number | null): void {
    this.#branches.push({ id, parentId, fromChangeId: fromChangeId ?? this.#tipOf(parentId), activated: false });
  }

  /**
   * 再建一棵树的根：`parentId` 为空的分支。
   *
   * @param id - 分支 id
   *
   * @remarks
   * 本地建库只有一个根（`main`），但 `syncBranches` 会原样落下远端 `parentId` 为空的分支，库里于是不止一棵树。
   */
  root(id: string): void {
    this.#branches.push({ id, parentId: null, fromChangeId: null, activated: false });
  }

  /** 把 active 标记挪到这条分支（只改标记；数据视图由测试自己的判定基准负责）。 */
  activate(id: string): void {
    for (const branch of this.#branches) branch.activated = branch.id === id;
  }

  insert(branchId: string, entityId: string, row: MemoryRow): number {
    return this.#push(branchId, 'INSERT', entityId, { ...row }, null);
  }

  update(branchId: string, entityId: string, patch: MemoryRow): number {
    const current = this.stateOf(branchId).get(entityId);
    if (!current) throw new Error(`夹具：分支 ${branchId} 上没有 ${entityId}，不能 UPDATE`);
    const inversePatch = Object.fromEntries(Object.keys(patch).map(field => [field, current[field]]));
    return this.#push(branchId, 'UPDATE', entityId, { ...patch }, inversePatch);
  }

  delete(branchId: string, entityId: string): number {
    const current = this.stateOf(branchId).get(entityId);
    if (!current) throw new Error(`夹具：分支 ${branchId} 上没有 ${entityId}，不能 DELETE`);
    return this.#push(branchId, 'DELETE', entityId, null, { ...current });
  }

  /**
   * 撤销一条变更：只给原行打上 `revertChangeId` 标记，不产生新的变更行。
   *
   * @param changeId - 要撤销的变更
   *
   * @remarks
   * 与 `undo-redo-apply.ts` 同一个语义：标记值取下一个序号（真实撤销同样推进变更序列），
   * 此后所有按 `revertChangeId = null` 过滤的查询都看不见这一行。
   */
  revert(changeId: number): void {
    const change = this.#changes.find(candidate => candidate.id === changeId);
    if (!change) throw new Error(`夹具：没有变更 ${changeId}`);
    change.revertChangeId = this.#nextChangeId++;
  }

  /**
   * 重放出一条分支在某个变更点的真实数据。
   *
   * @param branchId - 分支
   * @param uptoChangeId - 只算到这条变更（含）；缺省为全部
   * @returns 实体 id → 整行
   */
  stateOf(branchId: string, uptoChangeId = Number.POSITIVE_INFINITY): Map<string, MemoryRow> {
    const branch = this.#branch(branchId);
    const state =
      branch.parentId === null ? new Map<string, MemoryRow>() : this.stateOf(branch.parentId, branch.fromChangeId ?? 0);
    const own = this.#changes.filter(
      change =>
        change.branchId === branchId &&
        change.id > (branch.fromChangeId ?? 0) &&
        change.id <= uptoChangeId &&
        change.revertChangeId === null
    );
    for (const change of own) {
      if (change.type === 'INSERT') state.set(change.entityId, { ...change.patch });
      if (change.type === 'UPDATE') state.set(change.entityId, { ...state.get(change.entityId), ...change.patch });
      if (change.type === 'DELETE') state.delete(change.entityId);
    }
    return state;
  }

  /** 交给被测函数的只读仓库。 */
  readers(): SwitchBranchActionReaders {
    return {
      branchRepository: {
        find: async options =>
          query(this.#branches, options as unknown as QueryOptions).map(row => ({ ...row })) as unknown as RxDBBranch[]
      },
      changeRepository: {
        find: async options =>
          query(this.#changes, options as unknown as QueryOptions).map(row => ({
            ...row,
            patch: row.patch && { ...row.patch },
            inversePatch: row.inversePatch && { ...row.inversePatch }
          })) as unknown as RxDBChange[]
      }
    };
  }

  /** 夹具实体在折叠结果里的键（与 `getRxDBChangeKey` 同形）。 */
  static keyOf(entityId: string): string {
    return `${MEMORY_NAMESPACE}:${MEMORY_ENTITY}:${getRxDBEntityIdentityKey(entityId)}`;
  }

  #push(
    branchId: string,
    type: MemoryChange['type'],
    entityId: string,
    patch: MemoryRow | null,
    inversePatch: MemoryRow | null
  ): number {
    this.#branch(branchId);
    const id = this.#nextChangeId++;
    this.#changes.push({
      id,
      branchId,
      type,
      namespace: MEMORY_NAMESPACE,
      entity: MEMORY_ENTITY,
      entityId,
      patch,
      inversePatch,
      revertChangeId: null
    });
    return id;
  }

  #branch(id: string): MemoryBranch {
    const branch = this.#branches.find(candidate => candidate.id === id);
    if (!branch) throw new Error(`夹具：没有分支 ${id}`);
    return branch;
  }

  /** 一条分支当前的 tip：自有变更里最大的 id，没有就是它的分叉点。 */
  #tipOf(id: string): number | null {
    const own = this.#changes.filter(change => change.branchId === id && change.revertChangeId === null);
    return own.length > 0 ? Math.max(...own.map(change => change.id)) : this.#branch(id).fromChangeId;
  }
}
