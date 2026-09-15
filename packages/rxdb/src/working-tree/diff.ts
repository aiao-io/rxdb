/**
 * @fileoverview `diff()` 的唯一一条比较轴：`HEAD ↔ 工作树`（FR-005、硬裁决 2，
 * 接口见 contracts/core-api.md §3）
 *
 * @remarks
 * **这里只有一条轴，而且它没有入参。** 左端恒为
 * {@link WorkingTreeState.baseHeadCommitId}，右端恒为当前工作树；
 * `diff({ from: commitA, to: commitB })` 不是「多一个便利入参」——第二条轴一旦存在，
 * `status()` 的 `clean` 与 `diff()` 的结果就不再指同一件事，而 v1 的全部调用方捕获型 CAS
 * 都建立在「工作树只与当前 HEAD 比」之上。{@link WorkingTreeDiffOptions} 的键集因此是封闭的。
 *
 * **两种粒度只填一边。** 实体粒度填 {@link WorkingTreeDiff.entries}、事务粒度填
 * {@link WorkingTreeDiff.transactions}，另一边恒为空数组。两边都填等于同一份数据存两份，
 * 其中一份迟早在某次改动里没跟上，而调用方无从知道自己读的是哪一份。
 *
 * **分页用 keyset 而不是 offset。** 用户翻 diff 的同时工作树仍然可写：`OFFSET` 在两次读
 * 之间有人 `save()` 时会漏行或重复行，而漏掉的那一行照样会被下一次 `commit()` 提交——
 * 用户于是提交了他翻页时没看见的变更。游标就是上一页最后一行的 `id`，续读用 `id > cursor`。
 *
 * 本模块不解补丁：`patch` / `inversePatch` 原样摊出来，解码是
 * `working-tree-patch-codec.ts` 与 `cold-replay.ts` 的事。
 */

import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { readWorkingTreeStateRow } from './capture-runtime.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import type { WriteEntryOrigin } from './write-entry-matrix.js';
import type { WorkingTreeEntryOperation } from './write-entry.js';

/** 摊开的粒度：一条单元一行，或按事务收成组。 */
export type WorkingTreeDiffGranularity = 'entity' | 'transaction';

/**
 * 一次 `diff()` 的可选项（contracts/core-api.md §3）。
 *
 * @remarks
 * **键集是封闭的**：四个键里没有任何一个指向第二个比较端。新增键之前先回答
 * 「它会不会让调用方问出一个 `commit()` 无法据以提交的问题」——`from` / `to` / `ref`
 * 都会，所以它们不在这里。
 */
export interface WorkingTreeDiffOptions {
  /** 摊开的粒度，默认 `'entity'` */
  readonly granularity?: WorkingTreeDiffGranularity;

  /** 只看这些实体名；给空数组即「一个都不看」，不当成「不过滤」 */
  readonly entities?: readonly string[];

  /** 本页最多给几行；不给即一次给全 */
  readonly limit?: number;

  /** 上一页的 {@link WorkingTreeDiff.nextCursor}；从它之后接着读 */
  readonly cursor?: string;
}

/**
 * 一条未提交单元在 diff 里的样子。
 *
 * @remarks
 * 九个字段与 `CommitChangeSet` 的九列逐一对齐——提交时这批单元原样变成变更集，
 * 两边的字段集对不上就意味着「我看到的」与「我提交的」不是同一批数据。
 *
 * **不带 `sourceChangeId`。** 它只诊断，且指向的 `rxdb_change` 行会被删分支级联、
 * 压缩合并与失效清理带走；摊进 diff 等于邀请调用方拿它当重放数据来源。
 * 也不带 `id` 与 `fingerprint`：前者是分页游标的内部载体（见 {@link WorkingTreeDiff.nextCursor}），
 * 后者是折叠判定用的，两者都不是「这次改了什么」的一部分。
 */
export interface WorkingTreeDiffEntry {
  /** 变更单元 id；完整事务的全部实体共享同一个 */
  readonly unitId: string;

  /** 所属事务 id；单次 `save()` 为 `null` */
  readonly transactionId: string | null;

  /** 实体命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: string;

  /** 操作类型 */
  readonly operation: WorkingTreeEntryOperation;

  /** 正向补丁 */
  readonly patch: Record<string, unknown> | null;

  /** 逆向补丁 */
  readonly inversePatch: Record<string, unknown> | null;

  /** 变更来源；`remote_sync` **不豁免**（硬裁决 6） */
  readonly origin: WriteEntryOrigin;
}

/**
 * 事务粒度下的一组单元。
 *
 * @remarks
 * `transactionId` 为 `null` 的单元**各自成组**，不并进同一个「无事务」桶：并成一桶等于
 * 宣称两次互不相干的 `save()` 属于同一个原子操作，而用户在界面上看到的是「撤销这一组」。
 */
export interface WorkingTreeDiffTransaction {
  /** 这一组的事务 id；`null` 表示这一组只有一次独立的写 */
  readonly transactionId: string | null;

  /** 组内单元，保持读出的顺序 */
  readonly entries: readonly WorkingTreeDiffEntry[];
}

/** 一次 `diff()` 的全部回答（contracts/core-api.md §3）。 */
export interface WorkingTreeDiff {
  /** 摊开的是哪条分支 */
  readonly branchId: string;

  /** 比较的左端：工作树基于的那个 commit；分支还没有任何提交时为 `null` */
  readonly baseHeadCommitId: string | null;

  /** 比较的右端：当前工作树 revision */
  readonly workingTreeRevision: number;

  /** 本次实际使用的粒度 */
  readonly granularity: WorkingTreeDiffGranularity;

  /** 实体粒度的行；事务粒度下恒为空数组 */
  readonly entries: readonly WorkingTreeDiffEntry[];

  /** 事务粒度的组；实体粒度下恒为空数组 */
  readonly transactions: readonly WorkingTreeDiffTransaction[];

  /** 续读游标；本页已到末尾时为 `null` */
  readonly nextCursor: string | null;
}

/** 摊平成 diff 条目；**逐字段挑**而不是展开整行，`sourceChangeId` 与 `id` 由此挡在外面。 */
const toDiffEntry = (row: WorkingTreeEntry): WorkingTreeDiffEntry => ({
  unitId: row.unitId,
  transactionId: row.transactionId,
  namespace: row.namespace,
  entity: row.entity,
  entityId: row.entityId,
  operation: row.operation,
  patch: row.patch,
  inversePatch: row.inversePatch,
  origin: row.origin
});

/** 条目查询的一条规则；`WorkingTreeEntry` 没声明静态查询类型，`where` 在类型上是开放的。 */
interface WorkingTreeEntryRule {
  /** 列对应的字段名 */
  readonly field: string;
  /** 算子 */
  readonly operator: string;
  /** 比较值；`null` / `notNull` 不带 */
  readonly value?: unknown;
}

/** 按 {@link WorkingTreeDiffOptions} 拼出条目查询的 where 规则。 */
const buildEntryRules = (branchId: string, options: WorkingTreeDiffOptions): WorkingTreeEntryRule[] => {
  const rules: WorkingTreeEntryRule[] = [{ field: 'branchId', operator: '=', value: branchId }];
  if (options.entities !== undefined) rules.push({ field: 'entity', operator: 'in', value: [...options.entities] });
  if (options.cursor !== undefined) rules.push({ field: 'id', operator: '>', value: options.cursor });
  return rules;
};

/**
 * 读一页未提交条目。
 *
 * @remarks
 * 多读一行来判断「还有没有下一页」，而不是「读满 `limit` 就发游标」：后者在恰好读完时
 * 会发出一个指向空页的游标，调用方必须多打一次往返才知道已经到底。多读的那一行读完就丢。
 */
const readEntryPage = async (
  executor: TransactionExecutor,
  branchId: string,
  options: WorkingTreeDiffOptions
): Promise<{ rows: WorkingTreeEntry[]; nextCursor: string | null }> => {
  const { limit } = options;
  const rows = await executor.getRepository(WorkingTreeEntry).find({
    where: { combinator: 'and', rules: buildEntryRules(branchId, options) },
    orderBy: [{ field: 'id', sort: 'asc' }],
    ...(limit === undefined ? {} : { limit: limit + 1 })
  });
  if (limit === undefined || rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  return { rows: page, nextCursor: page[page.length - 1].id };
};

/**
 * 把一页条目按 `transactionId` 收成组，保持读出的顺序。
 *
 * @remarks
 * `null` 走的是另一条路：它不进 Map，直接自成一组。用 Map 统一处理的话，
 * `null` 会变成一个全局的桶键，于是整个工作树里所有独立的 `save()` 被并成一组。
 */
const groupByTransaction = (entries: readonly WorkingTreeDiffEntry[]): WorkingTreeDiffTransaction[] => {
  const groups: WorkingTreeDiffTransaction[] = [];
  const buckets = new Map<string, WorkingTreeDiffEntry[]>();
  for (const entry of entries) {
    const { transactionId } = entry;
    const bucket = transactionId === null ? undefined : buckets.get(transactionId);
    if (bucket) {
      bucket.push(entry);
      continue;
    }
    const created = [entry];
    if (transactionId !== null) buckets.set(transactionId, created);
    groups.push({ transactionId, entries: created });
  }
  return groups;
};

/**
 * 摊开一条分支的 `HEAD ↔ 工作树` 差异（FR-005）。
 *
 * @param executor - 调用方那个事务的执行器；本函数不自己开事务
 * @param branchId - 要摊开的分支
 * @param options - 见 {@link WorkingTreeDiffOptions}
 * @returns 见 {@link WorkingTreeDiff}
 * @throws {@link RxDBError} 工作树状态行缺失时
 *
 * @remarks
 * `branchId` 是显式入参而不是「自己读一次 active 分支」：门面上的 `diff()` 零参、只看当前
 * 分支，而 conformance 套件与恢复路径需要摊开一条指定的分支。把读 active 分支放进这里的话，
 * 后两者就只能先切分支再 diff。
 *
 * **只认 {@link WorkingTreeDiffOptions} 里那四个键**，不把 `options` 整个并进查询条件：
 * 并进去的话，调用方传的 `{ from: 'commit-a' }` 会变成一条针对不存在的 `from` 列的规则，
 * 而替身与真实后端对此的反应各不相同——有的抛错，有的静默地一行都匹配不到。
 */
export const readWorkingTreeDiff = async (
  executor: TransactionExecutor,
  branchId: string,
  options: WorkingTreeDiffOptions = {}
): Promise<WorkingTreeDiff> => {
  const state = await readWorkingTreeStateRow(executor, branchId);
  const granularity: WorkingTreeDiffGranularity = options.granularity ?? 'entity';
  const page = await readEntryPage(executor, branchId, options);
  const entries = page.rows.map(toDiffEntry);

  return {
    branchId,
    baseHeadCommitId: state.baseHeadCommitId,
    workingTreeRevision: state.workingTreeRevision,
    granularity,
    entries: granularity === 'entity' ? entries : [],
    transactions: granularity === 'transaction' ? groupByTransaction(entries) : [],
    nextCursor: page.nextCursor
  };
};
