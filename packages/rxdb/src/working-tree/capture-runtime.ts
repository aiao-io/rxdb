/**
 * @fileoverview 四个挂载点共用的捕获执行体：把一次写原语产生的 `rxdb_change` 折成工作树单元。
 *
 * @remarks
 * **捕获的数据源是变更日志，不是实体对象。** 写原语拿到的是实体实例或 SQL action，两者都不知道
 * 「这次写实际改了哪几列」——那个答案只有触发器写下的 `rxdb_change.patch` 有。从实体对象反推的话，
 * 未改动的列会一起进 patch，`diff()` 于是把「保存了一次」显示成「整行都变了」。
 *
 * **`sourceChangeId` 只是诊断线索。** 单元自带 `patch` / `inversePatch` 的独立完整副本
 * （data-model.md §2.7），因为 `rxdb_change` 会被删分支级联、压缩合并、回滚标记清理拿走——
 * 冷重放要是去 join 它，重放结果就依赖一张随时会被清的表。
 *
 * **捕获与业务写同事务**（adapter-contract.md §5）：本模块的每个入口都收一个
 * {@link TransactionExecutor}，而不是自己去开事务。自己开的话，崩溃会停在
 * 「业务表改了、工作树没记」，冷重放当场缺项。
 */

import { RxDBError } from '../RxDBError.js';
import { assertSingleActiveBranch } from '../commit/active-branch-guard.js';
import type { EntityManager } from '../entity/entity-manager.js';
import { uuid } from '../rxdb-utils.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { readWorkingTreeActivationState } from './activation-state.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { WorkingTreeState } from './working-tree-state.entity.js';
import type { WriteEntryOrigin } from './write-entry-matrix.js';
import type {
  ActiveBranchToken,
  CapturedWrite,
  WorkingTreeCapturePort,
  WorkingTreeEntryKey,
  WorkingTreeEntryOperation,
  WorkingTreeEntryRow
} from './write-entry.js';
import { captureCrudWrite } from './write-entry.js';

/**
 * 捕获需要的 `rxdb_change` 列
 *
 * @remarks
 * 刻意不收 `RxDBChange` 实体实例：`switchBranch` / `mergeChanges` 两个挂载点手上是还没落库的
 * `Omit<RxDBChange, 'id'>`，收实体会逼它们先造一个假 id。列集取到这里为止——多收一列，
 * 就多一个「单元里为什么有这个字段」要回答。
 */
export interface ChangeCaptureSource {
  /** `rxdb_change.id`；尚未落库的变更传 `null` */
  readonly id: number | null;
  /** 变更种类，来自 `IRxDBChange.type` */
  readonly type: 'INSERT' | 'UPDATE' | 'DELETE';
  /** 产生该变更的事务 id */
  readonly transactionId: string | null;
  /** 实体命名空间 */
  readonly namespace: string;
  /** 实体名 */
  readonly entity: string;
  /** 实体主键 */
  readonly entityId: string;
  /** 正向补丁 */
  readonly patch: Record<string, unknown> | null;
  /** 逆向补丁 */
  readonly inversePatch: Record<string, unknown> | null;
}

/** `rxdb_change.type` 到工作树单元操作的映射。 */
const OPERATION_OF: Readonly<Record<ChangeCaptureSource['type'], WorkingTreeEntryOperation>> = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete'
};

/**
 * 把任意 JSON 值折成**与键序无关**的规范字符串。
 *
 * @param value - 补丁值
 * @returns 规范化文本
 *
 * @remarks
 * `JSON.stringify` 的输出依赖属性插入顺序，而同一次写经两个后端回来的 patch 键序并不一致。
 * 直接拿它做指纹的话，同一行在 pglite 与 sqlite 上会得到两个指纹，冲突检测于是在跨端场景里
 * 恒为「有冲突」。
 */
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',');
  return `{${body}}`;
};

/**
 * 单元当前状态的指纹（FNV-1a/32，十六进制定长 8 位）。
 *
 * @param operation - 折叠后的操作
 * @param patch - 折叠后的正向补丁
 * @returns 指纹字符串
 *
 * @remarks
 * 用非加密哈希是因为它挡的不是伪造，而是**误判相等**：指纹进的是提交时的冲突比对，两端都由
 * 同一份实现算出。换成 SHA-256 要么引入 `crypto.subtle` 的异步（把同步折叠改成异步），
 * 要么多一个依赖，换来的抗碰撞性在这个用途上没有对应的攻击面。
 *
 * `operation` 参与哈希：同一份 patch 在 `insert` 与 `update` 下是两个不同的意图，
 * 只哈希 patch 会让两者指纹相同。
 */
export const fingerprintOf = (operation: WorkingTreeEntryOperation, patch: Record<string, unknown> | null): string => {
  const text = `${operation}:${canonicalize(patch)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/**
 * 把一条变更日志折成一次待捕获的写
 *
 * @param change - 变更日志列集
 * @param unitId - 本次原子边界的单元 id；整事务共用同一个
 * @param origin - 该写的来源
 * @returns {@link CapturedWrite}
 */
export const toCapturedWrite = (
  change: ChangeCaptureSource,
  unitId: string,
  origin: WriteEntryOrigin
): CapturedWrite => {
  const operation = OPERATION_OF[change.type];
  return {
    namespace: change.namespace,
    entity: change.entity,
    entityId: change.entityId,
    operation,
    patch: change.patch,
    inversePatch: change.inversePatch,
    fingerprint: fingerprintOf(operation, change.patch),
    origin,
    unitId,
    transactionId: change.transactionId,
    sourceChangeId: change.id
  };
};

/**
 * 读当前的 active 分支令牌
 *
 * @param executor - 调用方那个事务的执行器
 * @returns 分支 id 与激活态 revision
 * @throws {@link NoActiveBranchError} 零 active 分支时
 * @throws {@link AmbiguousActiveBranchError} 多 active 分支时
 *
 * @remarks
 * 两个字段来自两张表，但必须在**同一个事务**里读：分开读的话，中间可以插进一次
 * switch branch，于是令牌里的分支 id 属于旧分支、revision 属于新分支——一个从未存在过的状态。
 */
export const readActiveBranchToken = async (executor: TransactionExecutor): Promise<ActiveBranchToken> => {
  const branch = await assertSingleActiveBranch(executor);
  const activation = await readWorkingTreeActivationState(executor);
  return { branchId: branch.id, activationRevision: activation.activationRevision };
};

/** {@link createWorkingTreeCapturePort} 需要的宿主能力。 */
export interface WorkingTreeCaptureHost {
  /** 造工作树单元实例 */
  readonly entityManager: EntityManager;
}

/**
 * 取本分支的工作树状态行。
 *
 * @param executor - 调用方那个事务的执行器
 * @param branchId - 目标分支 id
 * @returns 该分支的状态行
 * @throws {@link RxDBError} 状态行缺失时
 *
 * @remarks
 * 状态行主键与分支 id **逐字相同**（`commit/branch-commit-rows.ts`），所以这里按主键取而不是
 * 按外键列扫。缺行**抛错**，不补行：补出来的 `workingTreeRevision = 0` 会让另一个 Tab 手上的
 * CAS 依据凭空回到起点，而 commit 的并发仲裁全靠它。
 *
 * 导出而不是留在本模块内，是因为 `status()` / `commit()` / `discard()` 读的是**同一行**：
 * 各自写一份「按主键取、缺行抛错」的话，某一处哪天改成「缺行当 0」，工作树 revision 就有了
 * 两种读法，而 CAS 的并发仲裁正建立在全部调用方读到同一个值上。
 */
export const readWorkingTreeStateRow = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<WorkingTreeState> => {
  const [row] = await executor.getRepository(WorkingTreeState).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (!row) {
    throw new RxDBError(
      `分支 ${branchId} 的工作树状态行缺失：迁移 0004-working-tree-commits 没为它建行，或它被外部删除了。` +
        '这不是「revision 为 0」，不能按 0 继续。'
    );
  }
  return row;
};

/** 按 `(branchId, namespace, entity, entityId)` 唯一索引取单元。 */
const findEntry = (
  executor: TransactionExecutor,
  token: ActiveBranchToken,
  key: WorkingTreeEntryKey
): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'branchId', operator: '=', value: token.branchId },
        { field: 'namespace', operator: '=', value: key.namespace },
        { field: 'entity', operator: '=', value: key.entity },
        { field: 'entityId', operator: '=', value: key.entityId }
      ]
    },
    limit: 1
  });

/**
 * 把一个事务执行器包成**单个身份**的 {@link WorkingTreeCapturePort}
 *
 * @param executor - 业务写所在的那个事务
 * @param host - 造实例用的实体管理器宿主
 * @param token - 本次写持有的 active 分支令牌
 * @param key - 本次捕获的实体身份
 * @returns 端口实例
 *
 * @remarks
 * **端口按身份建，不按事务建。** `persistEntry(undefined, -1)` 是「这一行折叠成净无变化」的
 * 信号，而那个调用里没有任何字段指向被删的是谁——身份只能由端口自己持有。做成事务级端口的话，
 * 删除只能靠「记住上一次 `readEntry` 问的是哪一行」，而那是一份会被下一次调用悄悄改写的状态。
 *
 * 端口**认领令牌里的 `branchId`**，不自己再查一次 active 分支：再查一次就等于允许
 * 「令牌说 A、落库落到 B」这种组合，而令牌校验的全部意义正是排除它。
 */
export const createWorkingTreeCapturePort = (
  executor: TransactionExecutor,
  host: WorkingTreeCaptureHost,
  token: ActiveBranchToken,
  key: WorkingTreeEntryKey
): WorkingTreeCapturePort => ({
  readActiveBranchToken: () => readActiveBranchToken(executor),

  readEntry: async () => (await findEntry(executor, token, key))[0],

  // 不收 `entryCountDelta`：同一份增量紧接着就由 `bumpWorkingTreeRevision` 加进
  // `rxdb_working_tree_state.entryCount`（`captureCrudWrite` 里两句挨着调）。这里再加一次，
  // 计数就是实际条目数的两倍——而它是 `status()` 判「有没有未提交变更」的那一列。
  async persistEntry(row: WorkingTreeEntryRow | undefined): Promise<void> {
    const repository = executor.getRepository(WorkingTreeEntry);
    const [existing] = await findEntry(executor, token, key);
    if (row === undefined) {
      if (!existing)
        throw new RxDBError(`折叠判定要删除 ${key.namespace}.${key.entity}#${key.entityId}，但库里没有这一行。`);
      await repository.remove(existing);
      return;
    }
    if (existing) {
      await repository.update(existing, {
        unitId: row.unitId,
        transactionId: row.transactionId,
        operation: row.operation,
        patch: row.patch as Record<string, unknown> | null,
        inversePatch: row.inversePatch as Record<string, unknown> | null,
        fingerprint: row.fingerprint,
        origin: row.origin,
        sourceChangeId: row.sourceChangeId
      });
      return;
    }
    const entry = host.entityManager.instantiate(WorkingTreeEntry);
    // 主键在这里生成，不靠实体默认值、也不靠数据库：`WorkingTreeEntry.id` 是
    // `primary: true` 且无默认值（与 `Commit` / `CommitChangeSet` 一致），六个后端的列都是
    // NOT NULL。漏掉它不会有任何类型错误，只会在第一次真的落库时整事务回滚——
    // 而那个事务里还装着用户的业务写。
    //
    // 不复用 `unitId`：整个事务的全部实体共享同一个 unitId（adapter-contract.md §5），
    // 拿它当主键的话，一次事务写两个实体时第二行直接撞主键。
    entry.id = uuid();
    entry.branchId = token.branchId;
    entry.unitId = row.unitId;
    entry.transactionId = row.transactionId;
    entry.namespace = row.namespace;
    entry.entity = row.entity;
    entry.entityId = row.entityId;
    entry.operation = row.operation;
    entry.patch = row.patch as Record<string, unknown> | null;
    entry.inversePatch = row.inversePatch as Record<string, unknown> | null;
    entry.fingerprint = row.fingerprint;
    entry.origin = row.origin;
    entry.sourceChangeId = row.sourceChangeId;
    await repository.create(entry);
  },

  async bumpWorkingTreeRevision(entryCountDelta: number): Promise<number> {
    const state = await readWorkingTreeStateRow(executor, token.branchId);
    const revision = state.workingTreeRevision + 1;
    await executor.getRepository(WorkingTreeState).update(state, {
      workingTreeRevision: revision,
      entryCount: state.entryCount + entryCountDelta
    });
    return revision;
  }
});

/**
 * 把一批变更日志捕获成工作树单元（**整批共享一个 `unitId`**）
 *
 * @param executor - 业务写所在的那个事务
 * @param host - 造实例用的实体管理器宿主
 * @param options - 令牌、来源与变更列表
 * @returns 实际落成单元的条数（被 {@link CaptureFilter} 挡掉的不计）
 *
 * @remarks
 * 一次写原语一个 `unitId`（adapter-contract.md §5「完整事务的全部实体共享同一个 unitId」）：
 * 每行各发一个的话，部分恢复会把一个原子操作劈成两半。
 *
 * 逐行 `await`，不 `Promise.all`：折叠要读同一张表的既有行，并发跑会让两条写同一实体的变更
 * 各自读到「还没有这一行」，然后双双 `create` 撞唯一索引。
 */
export const captureChanges = async (
  executor: TransactionExecutor,
  host: WorkingTreeCaptureHost,
  options: {
    /** 本次写持有的 active 分支令牌 */
    readonly token: ActiveBranchToken;
    /** 整批共享的单元 id */
    readonly unitId: string;
    /** 单元来源 */
    readonly origin: WriteEntryOrigin;
    /** 待捕获的变更日志 */
    readonly changes: readonly ChangeCaptureSource[];
    /** 该实体要不要进工作树；untracked 域在这里被挡掉 */
    readonly shouldCapture: (change: ChangeCaptureSource) => boolean;
  }
): Promise<number> => {
  let captured = 0;
  for (const change of options.changes) {
    if (!options.shouldCapture(change)) continue;
    const write = toCapturedWrite(change, options.unitId, options.origin);
    const port = createWorkingTreeCapturePort(executor, host, options.token, {
      namespace: write.namespace,
      entity: write.entity,
      entityId: write.entityId
    });
    await captureCrudWrite(port, options.token, write, async () => undefined);
    captured += 1;
  }
  return captured;
};
