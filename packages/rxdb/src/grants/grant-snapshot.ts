/**
 * @fileoverview 授权快照（US-029）：调用者在各作用域上有哪些成员权限。
 *
 * @remarks
 * 快照是「作用域键 → 权限集合」，另有一个状态：未取到 / 已取到。声明了规则形式写权限的实体，
 * 经公开写入口的写按「行的作用域 × 所需权限 × 快照」判定；快照未取到时一律拒绝（fail-closed）。
 *
 * 快照只是本机的快速失败依据，不是安全边界：远端由 RLS 按当前身份裁决，离线时感知不到远端刚发生的降权。
 */

import { firstArrayHole, isPlainRecord } from '../entity/json-safe.js';
import { RxDBError } from '../RxDBError.js';

/**
 * 授权快照的来源
 *
 * - `'app'`：应用经 `rxdb.grants.set()` 设入（没有远端的应用、单测、演示）
 * - `'remote'`：远端适配器报告（如 Supabase 的 `rxdb_caller_grants()`）
 */
export type RxDBGrantSource = 'app' | 'remote';

/** 授权快照的全部来源 */
export const RXDB_GRANT_SOURCES: readonly RxDBGrantSource[] = ['app', 'remote'];

/**
 * 调用者在一个作用域上的权限
 *
 * @remarks
 * 形状与 Supabase 参考实现 `rxdb_caller_grants()` 的返回行一致：`TABLE(scope text, permissions text[])`。
 */
export interface RxDBGrant {
  /** 作用域键，如 `tenant:<tenantId>`、`user:<userId>` */
  readonly scope: string;
  /** 在该作用域上的权限名，如 `['read', 'edit']` */
  readonly permissions: readonly string[];
}

/** 快照状态：`'unknown'` 还没取到（规则判定一律拒绝），`'known'` 已取到 */
export type RxDBGrantStatus = 'unknown' | 'known';

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** 按 UTF-16 码元比较：结果与运行环境的区域设置无关，同一份授权在任何地方都排成同一个顺序 */
const byCodeUnit = (a: string, b: string): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const isTextList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && firstArrayHole(value) === undefined && value.every(isText);

/** 单条授权的形状违规；合法为 `null` */
const grantIssue = (grant: unknown, index: number): string | null => {
  if (!isPlainRecord(grant))
    return `grants[${index}] 必须是 { scope, permissions } 对象，实际为 ${JSON.stringify(grant)}`;
  const unknownKeys = Object.keys(grant).filter(key => key !== 'scope' && key !== 'permissions');
  if (unknownKeys.length > 0) return `grants[${index}] 不接受键 ${unknownKeys.join('、')}：只有 scope / permissions`;
  const { scope, permissions } = grant;
  if (!isText(scope)) return `grants[${index}].scope 必须是非空字符串，实际为 ${JSON.stringify(scope)}`;
  if (!isTextList(permissions)) {
    return `grants[${index}].permissions 必须是非空字符串数组，实际为 ${JSON.stringify(permissions)}`;
  }
  return null;
};

/**
 * 一份授权的形状违规；合法为 `null`
 *
 * @param grants - 待校验的授权（来自应用、远端或本地库，形状一律不可信）
 */
export const grantsIssue = (grants: unknown): string | null => {
  if (!Array.isArray(grants) || firstArrayHole(grants) !== undefined) {
    return `授权必须是 { scope, permissions } 数组，实际为 ${JSON.stringify(grants)}`;
  }
  for (const [index, grant] of grants.entries()) {
    const issue = grantIssue(grant, index);
    if (issue) return issue;
  }
  return null;
};

/** 规范化：同一作用域合并，作用域与权限名按码元排序去重，没有权限的作用域丢掉；结果冻结 */
const normalizeGrants = (grants: readonly RxDBGrant[]): readonly RxDBGrant[] => {
  const merged = new Map<string, Set<string>>();
  for (const { scope, permissions } of grants) {
    const set = merged.get(scope) ?? new Set<string>();
    permissions.forEach(permission => set.add(permission));
    merged.set(scope, set);
  }
  const normalized = [...merged]
    .filter(([, permissions]) => permissions.size > 0)
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([scope, permissions]) =>
      Object.freeze({ scope, permissions: Object.freeze([...permissions].sort(byCodeUnit)) })
    );
  return Object.freeze(normalized);
};

/**
 * 授权快照：不可变的值
 *
 * @remarks
 * 只有两种取得方式：{@link RxDBGrantSnapshot.UNKNOWN}，或经 {@link RxDBGrantSnapshot.known} 校验并规范化。
 * 两份快照「状态、来源、授权」都相同即 {@link RxDBGrantSnapshot.equals}，不比取得时间：同样的授权再刷新一次不算变化。
 *
 * @example
 * ```typescript
 * const snapshot = rxdb.grants.snapshot;
 * if (snapshot.has(`tenant:${item.tenantId}`, 'edit')) showEditButton();
 * ```
 */
export class RxDBGrantSnapshot {
  /** 作用域键 → 权限集合，判定时 O(1) 查 */
  readonly #index: ReadonlyMap<string, ReadonlySet<string>>;

  /** 还没取到：判定一律拒绝 */
  static readonly UNKNOWN: RxDBGrantSnapshot = new RxDBGrantSnapshot(
    'unknown',
    Object.freeze([]),
    undefined,
    undefined
  );

  private constructor(
    /** 快照状态 */
    readonly status: RxDBGrantStatus,
    /** 规范化后的授权：按作用域排序，每个作用域的权限名排序去重；未取到时为空 */
    readonly grants: readonly RxDBGrant[],
    /** 来源；未取到时为 `undefined` */
    readonly source: RxDBGrantSource | undefined,
    /** 取得时间；未取到时为 `undefined` */
    readonly updatedAt: Date | undefined
  ) {
    this.#index = new Map(grants.map(grant => [grant.scope, new Set(grant.permissions)]));
  }

  /**
   * 已取到的快照
   *
   * @param grants - 调用者在各作用域上的权限
   * @param source - 来源
   * @param updatedAt - 取得时间
   * @throws {@link RxDBError} 授权形状不对、来源不认识
   */
  static known(grants: readonly RxDBGrant[], source: RxDBGrantSource, updatedAt: Date): RxDBGrantSnapshot {
    const issue = grantsIssue(grants);
    if (issue) throw new RxDBError(`授权形状不对：${issue}`);
    if (!RXDB_GRANT_SOURCES.includes(source)) {
      throw new RxDBError(`授权来源只能是 ${RXDB_GRANT_SOURCES.join(' / ')}，实际为 ${JSON.stringify(source)}`);
    }
    return new RxDBGrantSnapshot('known', normalizeGrants(grants), source, updatedAt);
  }

  /**
   * 调用者在这个作用域上有没有这项权限
   *
   * @param scope - 作用域键，如 `tenant:a`
   * @param permission - 权限名，如 `edit`
   * @returns 未取到时恒为 `false`
   */
  has(scope: string, permission: string): boolean {
    return this.#index.get(scope)?.has(permission) === true;
  }

  /**
   * 两份快照的内容是否相同：状态、来源与授权都相同（不比取得时间）
   *
   * @param other - 另一份快照
   */
  equals(other: RxDBGrantSnapshot): boolean {
    return (
      this.status === other.status &&
      this.source === other.source &&
      JSON.stringify(this.grants) === JSON.stringify(other.grants)
    );
  }
}
