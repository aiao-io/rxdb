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

import type { EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { assertSingleActiveBranch, RxDBError, uuid } from '@aiao/rxdb';
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

/**
 * 读一条分支当前全部未提交条目，按 `id` 升序
 *
 * @param executor - 调用方那个事务的执行器
 * @param branchId - 要读的分支 id
 * @returns 该分支上的全部未提交条目，`id` 升序
 *
 * @remarks
 * **按 `id` 升序**而不是让后端自由排：`CommitChangeSet.sequence` 按这个顺序密集发放，
 * 而内容指纹又吃这个顺序。排序不定的话，同一批变更在两个后端上算出两个指纹，
 * `assertCommitGraphIntact()` 会把其中一边整条链判成损坏。
 *
 * 与 {@link readWorkingTreeStateRow} 同一个导出理由：`commit()`（`commit-command.ts`）与
 * 建分支时的条目复制（`commit/branch-commit-rows.ts`）读的是**同一批行、同一个顺序**。
 * 各写一份的话，某一处哪天改了 `orderBy`，两条路径复制出的条目排列就此分家——而指纹吃这个
 * 排列，分家的那天 `assertCommitGraphIntact()` 会把其中一边整条链判成损坏。
 */
export const readBranchEntries = (executor: TransactionExecutor, branchId: string): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });

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
 * 一批变更共用的捕获上下文
 *
 * @remarks
 * 批级的意义只有一个：**同一个事务里，读两遍的东西只读一遍**。
 *
 * - **令牌**（active 分支 + activation revision）两个字段来自两张表，逐变更重读一次就是每条变更
 *   2 次查询。同事务里的第二次读只可能读回第一次那个值——token 校验要拦的是「另一个 realm 在
 *   期间切过分支」，而那种切换要么在本事务开始前已经提交（第一次读就看得见），要么在本事务提交前
 *   落不了地（本事务正持着工作树行的写锁）。
 * - **状态行**只在第一次 `bumpWorkingTreeRevision()` 时读出来，此后在内存里累加，
 *   由 {@link WorkingTreeCaptureBatch.flush} 一次写回。中间态的 `workingTreeRevision` 在事务内
 *   无人可读，可观测的只有提交后的终值，而终值与逐条读改写逐字相同。
 *
 * 一条都没捕获时**一次查询都不发**：`untracked` 域整批被挡掉是常态，那种批次不该为了
 * 「先把状态行读出来备用」付一次 IO。
 */
export interface WorkingTreeCaptureBatch {
  /**
   * 为这一批里的**一条**变更造端口
   *
   * @param key - 这条变更的实体身份
   * @returns 绑在该身份上的端口
   *
   * @remarks
   * 每条变更各造一个，不按身份复用：同一实体在一批里连写两次时，第二次必须重新读一遍既有行——
   * 它要读的正是第一次刚落下去的那一行。
   */
  portFor(key: WorkingTreeEntryKey): WorkingTreeCapturePort;

  /**
   * 把本批攒下的 `workingTreeRevision` / `entryCount` 一次写回状态行
   *
   * @remarks
   * 没有任何一条变更走过 `bumpWorkingTreeRevision()` 时不发语句。必须在**同一个事务**里调用，
   * 且排在全部条目落盘之后：反过来的话，条目写失败时 revision 已经 +1，而它是 commit 的 CAS 依据。
   */
  flush(): Promise<void>;
}

/**
 * 本批攒下的状态行增量
 *
 * @remarks
 * 存的是**递增之后的值**而不是增量：`bumpWorkingTreeRevision()` 要原样返回递增后的 revision，
 * 存增量就得在两处各算一次同一个加法。
 */
interface PendingWorkingTreeState {
  /** 第一次 bump 时读出来的那一行；`flush()` 拿它当 update 的目标 */
  readonly row: WorkingTreeState;

  /** 递增后的 `workingTreeRevision` */
  revision: number;

  /** 累加后的 `entryCount` */
  entryCount: number;
}

/**
 * 建一批变更共用的捕获上下文
 *
 * @param executor - 业务写所在的那个事务
 * @param host - 造实例用的实体管理器宿主
 * @param token - 本批写持有的 active 分支令牌
 * @returns 批上下文
 *
 * @remarks
 * 端口**认领令牌里的 `branchId`**，不自己再查一次 active 分支：再查一次就等于允许
 * 「令牌说 A、落库落到 B」这种组合，而令牌校验的全部意义正是排除它。
 */
export const createWorkingTreeCaptureBatch = (
  executor: TransactionExecutor,
  host: WorkingTreeCaptureHost,
  token: ActiveBranchToken
): WorkingTreeCaptureBatch => {
  // 记的是 Promise 不是值：并发两次调用时第二次等在同一次读上，而不是再发一条查询。
  let tokenRead: Promise<ActiveBranchToken> | undefined;
  let pendingRead: Promise<PendingWorkingTreeState> | undefined;

  const readToken = (): Promise<ActiveBranchToken> => (tokenRead ??= readActiveBranchToken(executor));

  const readPending = (): Promise<PendingWorkingTreeState> =>
    (pendingRead ??= readWorkingTreeStateRow(executor, token.branchId).then(row => ({
      row,
      revision: row.workingTreeRevision,
      entryCount: row.entryCount
    })));

  return {
    portFor: key => createBatchPort({ executor, host, token, key, readToken, readPending }),

    async flush(): Promise<void> {
      if (!pendingRead) return;
      const pending = await pendingRead;
      await executor.getRepository(WorkingTreeState).update(pending.row, {
        workingTreeRevision: pending.revision,
        entryCount: pending.entryCount
      });
    }
  };
};

/** {@link createBatchPort} 的入参；批级共享的两个读器与本条变更的身份。 */
interface BatchPortContext {
  /** 业务写所在的那个事务 */
  readonly executor: TransactionExecutor;
  /** 造实例用的实体管理器宿主 */
  readonly host: WorkingTreeCaptureHost;
  /** 本批写持有的 active 分支令牌 */
  readonly token: ActiveBranchToken;
  /** 本条变更的实体身份 */
  readonly key: WorkingTreeEntryKey;
  /** 批级令牌读器 */
  readonly readToken: () => Promise<ActiveBranchToken>;
  /** 批级状态行读器 */
  readonly readPending: () => Promise<PendingWorkingTreeState>;
}

/**
 * 从一次折叠结果建首行
 *
 * @param host - 造实例用的实体管理器宿主
 * @param token - 本批写持有的 active 分支令牌
 * @param row - 折叠后的行
 * @returns 待落库的实体实例
 *
 * @remarks
 * 主键在这里生成，不靠实体默认值、也不靠数据库：`WorkingTreeEntry.id` 是 `primary: true` 且无默认值
 * （与 `Commit` / `CommitChangeSet` 一致），六个后端的列都是 NOT NULL。漏掉它不会有任何类型错误，
 * 只会在第一次真的落库时整事务回滚——而那个事务里还装着用户的业务写。
 *
 * 不复用 `unitId`：整个事务的全部实体共享同一个 unitId（adapter-contract.md §5），
 * 拿它当主键的话，一次事务写两个实体时第二行直接撞主键。
 */
const newEntryOf = (
  host: WorkingTreeCaptureHost,
  token: ActiveBranchToken,
  row: WorkingTreeEntryRow
): WorkingTreeEntry => {
  const entry = host.entityManager.instantiate(WorkingTreeEntry);
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
  return entry;
};

/**
 * 把批上下文与一个实体身份包成 {@link WorkingTreeCapturePort}
 *
 * @param context - 批级读器与本条变更的身份
 * @returns 端口实例
 *
 * @remarks
 * **端口按身份建，不按事务建。** `persistEntry(undefined, -1)` 是「这一行折叠成净无变化」的信号，
 * 而那个调用里没有任何字段指向被删的是谁——身份只能由端口自己持有。做成事务级端口的话，
 * 删除只能靠「记住上一次 `readEntry` 问的是哪一行」，而那是一份会被下一次调用悄悄改写的状态。
 *
 * **`persistEntry()` 必须跟在同一个端口的 `readEntry()` 之后。** 两者之间没有任何别的写，
 * 再查一遍唯一索引只会拿回同一行，于是 `readEntry()` 读到的那一行被记下来直接用。
 * 没读过就落盘的调用一律**抛错**，不补一次查询：补上去的那次查询正是本次要省掉的那条，
 * 而「端口自己悄悄读一遍」会让「readEntry 说有、库里其实没有」这种不自洽的组合继续无声通过。
 */
const createBatchPort = (context: BatchPortContext): WorkingTreeCapturePort => {
  const { executor, host, token, key, readToken, readPending } = context;
  const identity = `${key.namespace}.${key.entity}#${key.entityId}`;
  // `undefined` = 还没读过；`{ row: undefined }` = 读过了，库里没有。两者不是一回事。
  let seen: { readonly row: WorkingTreeEntry | undefined } | undefined;

  const seenRow = (): WorkingTreeEntry | undefined => {
    if (!seen) {
      throw new RxDBError(
        `落 ${identity} 的单元之前没有经同一个端口 readEntry()：折叠依据的那一行不在手上，不能猜它在不在库里。`
      );
    }
    return seen.row;
  };

  return {
    readActiveBranchToken: readToken,

    // 形参 `key` 由 `WorkingTreeCapturePort` 的签名带来，这里认的是构造时绑定的那个身份：
    // 端口只服务一条变更，两者永远是同一个。
    readEntry: async () => {
      const [row] = await findEntry(executor, token, key);
      seen = { row };
      return row;
    },

    // 不收 `entryCountDelta`：同一份增量紧接着就由 `bumpWorkingTreeRevision` 加进
    // `rxdb_working_tree_state.entryCount`（`captureCrudWrite` 里两句挨着调）。这里再加一次，
    // 计数就是实际条目数的两倍——而它是 `status()` 判「有没有未提交变更」的那一列。
    async persistEntry(row: WorkingTreeEntryRow | undefined): Promise<void> {
      const repository = executor.getRepository(WorkingTreeEntry);
      const existing = seenRow();
      if (row === undefined) {
        if (!existing) throw new RxDBError(`折叠判定要删除 ${identity}，但刚读到的既有行是空的。`);
        await repository.remove(existing);
        return;
      }
      if (!existing) {
        await repository.create(newEntryOf(host, token, row));
        return;
      }
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
    },

    async bumpWorkingTreeRevision(entryCountDelta: number): Promise<number> {
      const pending = await readPending();
      pending.revision += 1;
      pending.entryCount += entryCountDelta;
      return pending.revision;
    }
  };
};

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
 * 「只有一条变更的批」：语义与 {@link createWorkingTreeCaptureBatch} 完全一致，区别只在
 * `bumpWorkingTreeRevision()` **自己收尾**——单端口的调用方手上没有批对象，也就没有地方调
 * {@link WorkingTreeCaptureBatch.flush}，攒着不写的话这一次递增永远落不了库。
 */
export const createWorkingTreeCapturePort = (
  executor: TransactionExecutor,
  host: WorkingTreeCaptureHost,
  token: ActiveBranchToken,
  key: WorkingTreeEntryKey
): WorkingTreeCapturePort => {
  const batch = createWorkingTreeCaptureBatch(executor, host, token);
  const port = batch.portFor(key);
  return {
    readActiveBranchToken: () => port.readActiveBranchToken(),
    readEntry: entryKey => port.readEntry(entryKey),
    persistEntry: (row, entryCountDelta) => port.persistEntry(row, entryCountDelta),
    async bumpWorkingTreeRevision(entryCountDelta: number): Promise<number> {
      const revision = await port.bumpWorkingTreeRevision(entryCountDelta);
      await batch.flush();
      return revision;
    }
  };
};

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
 *
 * 整批共用一个 {@link WorkingTreeCaptureBatch}：令牌与状态行于是各读一次，而不是每条变更各读一次。
 * 一批 M 条变更的查询数因此从 `7M` 落到 `2M + 3`——这是整个插件里唯一按**用户写入频率**跑的一段，
 * 一次批量导入 500 行时那个系数直接乘在 500 上。
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
  const batch = createWorkingTreeCaptureBatch(executor, host, options.token);
  let captured = 0;
  for (const change of options.changes) {
    if (!options.shouldCapture(change)) continue;
    const write = toCapturedWrite(change, options.unitId, options.origin);
    const port = batch.portFor({ namespace: write.namespace, entity: write.entity, entityId: write.entityId });
    await captureCrudWrite(port, options.token, write, async () => undefined);
    captured += 1;
  }
  // 收尾排在全部条目落盘之后，顺序与 `captureCrudWrite` 的第三、四步一致：反过来的话，
  // 条目写失败时 revision 已经 +1，而它是 commit 的 CAS 依据。
  await batch.flush();
  return captured;
};
