/**
 * @fileoverview 冷重放不变量——判定「捕获是否完备」的**唯一**判据
 *   （contracts/conformance-suites.md §1.1、SC-009）。
 *
 * @remarks
 * 这不是一个业务能力，是一把**尺子**：`HEAD 投影 + 全部工作树单元` 重放出来的净状态，必须与业务表
 * 的实际内容**逐字段**相等。T067 的捕获套件在 4 个挂载点的每一组末尾都拿它量一次，6 个 v1 后端
 * 共用同一把。
 *
 * 为什么判据是重放而不是计数：「改了 3 行就该有 3 个单元」写起来一行，两个方向却都测不到。
 * 折叠规则让「同一实体写 5 次 = 1 个单元」「insert 后 delete = 0 个单元」，计数天然对不上；
 * 而一个把 `body` 列漏掉的 patch，计数分毫不差。
 *
 * 「冷」是指只读**持久化的那几列**：身份三列 + `operation` + `patch`。
 *
 * - `sourceChangeId` 不参与——它在实体上就写明「**仅诊断**」。`rxdb_change` 会被删分支级联 /
 *   压缩合并 / 清理，顺着它重放今天能跑通，某次清理之后静默少几行。
 * - `origin` 不参与——远端同步产生的单元照常重放。按来源豁免等于把 `remote_sync` 的捕获缺陷
 *   永久藏起来。
 * - `unitId` / `transactionId` / `fingerprint` / 时间戳都不参与：它们是诊断列。
 *
 * 唯一索引 `(branchId, namespace, entity, entityId)` 保证每个身份至多一行，所以重放**与顺序无关**。
 * 「按 `find()` 返回顺序依次 apply」今天恰好正确，换个驱动、加个 `ORDER BY`，或者某天真的出现两行
 * 同身份，就静默出错。
 */

import { RxDBError } from '@aiao/rxdb';
import type { WorkingTreeEntry } from './working-tree-entry.entity.js';

/** 一行业务数据的身份，与工作树单元的唯一索引除 `branchId` 外的部分一致。 */
export interface ColdReplayIdentity {
  /** 实体所属命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: string;
}

/** 一行业务数据：身份 + 全部列值。 */
export interface ColdReplayRow extends ColdReplayIdentity {
  /** 列名 → 列值；缺一个键与该键为 `null` 是**两件事** */
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * 一组业务数据行
 *
 * @remarks
 * 数组顺序**不是**契约的一部分：每个身份至多一行，比对按身份进行。
 */
export type ColdReplaySnapshot = readonly ColdReplayRow[];

/** 重放结果与业务表实际内容的一处差异。 */
export type ColdReplayMismatch =
  | {
      /** 同一行的某一列对不上 */
      readonly kind: 'field_mismatch';
      /** 实体所属命名空间 */
      readonly namespace: string;
      /** 实体名 */
      readonly entity: string;
      /** 实体主键 */
      readonly entityId: string;
      /** 对不上的列名 */
      readonly field: string;
      /** 重放得到的值；该列不存在时为 `undefined` */
      readonly replayed: unknown;
      /** 业务表里的值；该列不存在时为 `undefined` */
      readonly actual: unknown;
    }
  | {
      /** 重放出了业务表没有的行——**幻影捕获**，写了不该写的单元 */
      readonly kind: 'replay_only_row';
      /** 实体所属命名空间 */
      readonly namespace: string;
      /** 实体名 */
      readonly entity: string;
      /** 实体主键 */
      readonly entityId: string;
    }
  | {
      /** 业务表有而重放里没有——**挂载点漏捕获** */
      readonly kind: 'business_only_row';
      /** 实体所属命名空间 */
      readonly namespace: string;
      /** 实体名 */
      readonly entity: string;
      /** 实体主键 */
      readonly entityId: string;
    };

/** 身份三列拼成的比对键，同时也是失败报告里点名用的写法。 */
const identityKey = (identity: ColdReplayIdentity): string =>
  `${identity.namespace}.${identity.entity}#${identity.entityId}`;

/** 只取身份三列，丢掉 `fields` 与诊断列。 */
const identityOf = (identity: ColdReplayIdentity): ColdReplayIdentity => ({
  namespace: identity.namespace,
  entity: identity.entity,
  entityId: identity.entityId
});

/**
 * 工作树单元违反了折叠不变量
 *
 * @remarks
 * 「HEAD 里已存在却标 `insert`」「HEAD 里没有却标 `delete`」「同一身份两行」——这三种输入在折叠规则
 * （data-model.md §2.7）下**不可能产生**，出现即表示工作树已经坏了。
 *
 * 所以这里不兜底：「就当 update 处理」会让一个坏掉的工作树重放成功，于是唯一判据判出绿灯。
 */
export class WorkingTreeReplayCorruptionError extends RxDBError {
  /** 出问题那一行的身份 */
  readonly identity: ColdReplayIdentity;

  /** 该单元声明的操作 */
  readonly operation: WorkingTreeEntry['operation'];

  /**
   * @param entry - 出问题的工作树单元
   * @param reason - 它违反了哪一条不变量
   */
  constructor(entry: Pick<WorkingTreeEntry, 'namespace' | 'entity' | 'entityId' | 'operation'>, reason: string) {
    super(`工作树单元 ${identityKey(entry)}（${entry.operation}）违反折叠不变量：${reason}`);
    this.identity = identityOf(entry);
    this.operation = entry.operation;
    this.name = 'WorkingTreeReplayCorruptionError';
    Object.setPrototypeOf(this, WorkingTreeReplayCorruptionError.prototype);
  }
}

/**
 * 取 `insert` / `update` 单元的 patch
 *
 * @param entry - 工作树单元
 * @returns 非空 patch
 * @throws {@link WorkingTreeReplayCorruptionError} patch 为 `null`
 */
function patchOf(entry: WorkingTreeEntry): Readonly<Record<string, unknown>> {
  if (entry.patch === null) {
    throw new WorkingTreeReplayCorruptionError(
      entry,
      `${entry.operation} 单元的 patch 为 null——记了「变过」却没记变成什么`
    );
  }
  return entry.patch;
}

/**
 * 把一个单元应用到净状态上
 *
 * @param rows - 净状态，就地修改（它是本函数自己造的 Map，不是入参快照）
 * @param entry - 工作树单元
 * @throws {@link WorkingTreeReplayCorruptionError} 该单元与 HEAD 的存在性对不上，或 patch 形状不对
 */
function applyEntry(rows: Map<string, ColdReplayRow>, entry: WorkingTreeEntry): void {
  const key = identityKey(entry);
  const existing = rows.get(key);
  if (entry.operation === 'insert') {
    if (existing !== undefined) throw new WorkingTreeReplayCorruptionError(entry, 'HEAD 里已存在这一行');
    rows.set(key, { ...identityOf(entry), fields: { ...patchOf(entry) } });
    return;
  }
  if (existing === undefined) throw new WorkingTreeReplayCorruptionError(entry, 'HEAD 里没有这一行');
  if (entry.operation === 'delete') {
    if (entry.patch !== null) {
      throw new WorkingTreeReplayCorruptionError(entry, 'delete 单元带着 patch——恢复数据只该在 inversePatch 里');
    }
    rows.delete(key);
    return;
  }
  rows.set(key, { ...identityOf(entry), fields: { ...existing.fields, ...patchOf(entry) } });
}

/**
 * 用 `HEAD 投影 + 全部工作树单元` 重放出净状态
 *
 * @param head - HEAD 的业务数据投影
 * @param entries - 该分支上全部未提交单元，**顺序无关**
 * @returns 重放出的净状态
 * @throws {@link WorkingTreeReplayCorruptionError} 单元违反折叠不变量
 *
 * @remarks
 * `insert` 的净状态**只**来自 patch，不掺 HEAD 的任何字段；`update` 把 patch 逐字段盖在 HEAD 行上，
 * 未提及的字段原样保留；`delete` 让这一行消失，不是留一行空值。
 *
 * 不改入参：HEAD 快照与其中的 `fields` 对象都不会被就地修改。
 *
 * @example
 * ```ts
 * const replayed = replayWorkingTree(await projectHead(branch), await readEntries(branch));
 * expect(diffColdReplay(replayed, await readBusinessTables())).toEqual([]);
 * ```
 */
export function replayWorkingTree(head: ColdReplaySnapshot, entries: readonly WorkingTreeEntry[]): ColdReplaySnapshot {
  const rows = new Map<string, ColdReplayRow>();
  for (const row of head) rows.set(identityKey(row), { ...identityOf(row), fields: { ...row.fields } });
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = identityKey(entry);
    if (seen.has(key)) throw new WorkingTreeReplayCorruptionError(entry, '同一身份出现两行——唯一索引本不允许');
    seen.add(key);
    applyEntry(rows, entry);
  }
  return [...rows.values()];
}

/** 非 `Date`、非数组的对象，按结构逐键比。 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** 两个记录的键集完全相同。 */
const sameKeys = (left: Record<string, unknown>, right: Record<string, unknown>): boolean => {
  const rightKeys = Object.keys(right);
  return Object.keys(left).length === rightKeys.length && rightKeys.every(key => key in left);
};

/**
 * 结构相等
 *
 * @param left - 左值
 * @param right - 右值
 * @returns 结构相同为 `true`
 *
 * @remarks
 * 三处专门处理，都是因为 `JSON.stringify` 判等在这里会给出错误答案：
 *
 * - **`Date` 按时间值比**。每次从库里读回来都是新实例，按对象同一性比会让不变量永远红。
 * - **键序不参与**。键序不同就假红，而键序取决于驱动怎么拼 `SELECT`。
 * - **json 列比到底**。嵌套里差一个数组元素就必须点名到该列，否则报告只会说「这行不一样」。
 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  return sameKeys(left, right) && Object.keys(left).every(key => deepEqual(left[key], right[key]));
}

/**
 * 逐列比对同一行
 *
 * @param replayed - 重放得到的行
 * @param actual - 业务表里的行
 * @returns 该行的全部列差异，**按列名排序**
 *
 * @remarks
 * 排序不是洁癖：跟着键序走的话，同一处缺陷在两个后端上会印出两种顺序，
 * 「CI 日志一比就知道是不是同一个问题」立刻失效。
 *
 * 取值用 `obj[field]`，缺键与 `undefined` 因此同形——而 `null` 与两者都不等，
 * 「这一列压根不在」与「这一列是 null」由此分得开。
 */
function compareFields(replayed: ColdReplayRow, actual: ColdReplayRow): ColdReplayMismatch[] {
  const fields = [...new Set([...Object.keys(replayed.fields), ...Object.keys(actual.fields)])].sort();
  return fields
    .filter(field => !deepEqual(replayed.fields[field], actual.fields[field]))
    .map(field => ({
      kind: 'field_mismatch' as const,
      ...identityOf(replayed),
      field,
      replayed: replayed.fields[field],
      actual: actual.fields[field]
    }));
}

/** 同一身份在两侧的比对；一侧缺失即整行差异。 */
function compareRow(replayed: ColdReplayRow | undefined, actual: ColdReplayRow | undefined): ColdReplayMismatch[] {
  if (replayed === undefined) {
    if (actual === undefined) return [];
    return [{ kind: 'business_only_row', ...identityOf(actual) }];
  }
  if (actual === undefined) return [{ kind: 'replay_only_row', ...identityOf(replayed) }];
  return compareFields(replayed, actual);
}

/** 快照按身份建索引。 */
const indexByIdentity = (snapshot: ColdReplaySnapshot): Map<string, ColdReplayRow> =>
  new Map(snapshot.map(row => [identityKey(row), row]));

/**
 * 比对重放结果与业务表实际内容
 *
 * @param replayed - {@link replayWorkingTree} 的结果
 * @param actual - 业务表里读出来的实际内容
 * @returns 全部差异；相等时为空数组
 *
 * @remarks
 * **两个方向都是缺陷**：业务表变了而没有单元（`field_mismatch` 或 `business_only_row`）说明挂载点
 * 漏了；有单元而业务表没那一行（`replay_only_row`）说明捕获写了不该写的。只查其中一个方向的判据，
 * 会把另一半故障判成通过。
 *
 * 两侧的行顺序不参与比对。
 */
export function diffColdReplay(
  replayed: ColdReplaySnapshot,
  actual: ColdReplaySnapshot
): readonly ColdReplayMismatch[] {
  const replayedRows = indexByIdentity(replayed);
  const actualRows = indexByIdentity(actual);
  const keys = [...new Set([...replayedRows.keys(), ...actualRows.keys()])].sort();
  return keys.flatMap(key => compareRow(replayedRows.get(key), actualRows.get(key)));
}

/** 一处差异的人话描述，点名到实体与列。 */
function describeMismatch(mismatch: ColdReplayMismatch): string {
  const where = identityKey(mismatch);
  if (mismatch.kind === 'replay_only_row') return `  ${where}：重放出了这一行，业务表里没有（幻影捕获）`;
  if (mismatch.kind === 'business_only_row') return `  ${where}：业务表里有这一行，重放里没有（挂载点漏捕获）`;
  return `  ${where} 的 ${mismatch.field}：重放得到 ${JSON.stringify(mismatch.replayed)}，业务表是 ${JSON.stringify(mismatch.actual)}`;
}

/** 冷重放不变量被破坏。 */
export class ColdReplayMismatchError extends RxDBError {
  /** 全部差异，按身份与列名排序 */
  readonly mismatches: readonly ColdReplayMismatch[];

  /**
   * @param mismatches - {@link diffColdReplay} 给出的差异，**必须非空**
   */
  constructor(mismatches: readonly ColdReplayMismatch[]) {
    super(`冷重放不变量被破坏（${mismatches.length} 处差异）：\n${mismatches.map(describeMismatch).join('\n')}`);
    this.mismatches = mismatches;
    this.name = 'ColdReplayMismatchError';
    Object.setPrototypeOf(this, ColdReplayMismatchError.prototype);
  }
}

/** {@link assertColdReplayInvariant} 的入参。 */
export interface ColdReplayInvariantInput {
  /** HEAD 的业务数据投影 */
  readonly head: ColdReplaySnapshot;

  /** 该分支上全部未提交单元 */
  readonly entries: readonly WorkingTreeEntry[];

  /** 业务表里读出来的实际内容 */
  readonly actual: ColdReplaySnapshot;
}

/**
 * 核验冷重放不变量
 *
 * @param input - HEAD 投影、全部单元、业务表实际内容
 * @throws {@link ColdReplayMismatchError} 重放结果与业务表对不上
 * @throws {@link WorkingTreeReplayCorruptionError} 单元违反折叠不变量
 *
 * @remarks
 * 捕获套件每组用例的末尾调用它。相等时静默返回——不打印「通过」，因为 6 个后端 × 十几组的日志里，
 * 成功行只会淹没失败行。
 *
 * @example
 * ```ts
 * assertColdReplayInvariant({ head, entries, actual: await readBusinessTables() });
 * ```
 */
export function assertColdReplayInvariant(input: ColdReplayInvariantInput): void {
  const mismatches = diffColdReplay(replayWorkingTree(input.head, input.entries), input.actual);
  if (mismatches.length > 0) throw new ColdReplayMismatchError(mismatches);
}
