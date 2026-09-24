/**
 * @fileoverview 工作树单元的折叠规则（data-model.md §2.6 / §2.7）。
 *
 * @remarks
 * 唯一约束是 `(branch, namespace, entity, entityId)`——同一分支同一实体至多一个未提交单元。
 * 所以「第二次写同一个实体」不是插入第二行，而是把新捕获折进已有那一行。
 *
 * 折叠做成**纯函数**：给它「已有单元（可能没有）+ 这次捕获」，它回答「留成什么样 / 要不要删掉」
 * 以及 `entryCount` 怎么动。计数变化由折叠这一处给出，调用方不必自己数——`entryCount` 是冗余列，
 * 它与实际行数对不上时，冗余列就是第二份真相，而且是错的那份。
 *
 * **折叠拿不到 HEAD**（签名里没有），这是刻意的：值级归零要读 HEAD 投影，代价与 `diff()` 同阶，
 * 摊到每次 `save()` 上会顶穿 SC-001 的 100 ms 预算。见规则 4。
 */

import { RxDBError } from '@aiao/rxdb';
import { CommitErrorCode } from '../commit/commit-error-codes.js';
import type { WriteEntryOrigin } from './write-entry-matrix.js';

/** 单元相对 HEAD 的净操作。 */
export type WorkingTreeEntryOperation = 'insert' | 'update' | 'delete';

/** 字段级 patch；`null` 表示「这一侧没有值」（insert 的逆、delete 的正向）。 */
export type WorkingTreePatch = Readonly<Record<string, unknown>> | null;

/**
 * 一次被捕获的写
 *
 * @remarks
 * 与持久化行同形而不共用一个类型：捕获是**这一次**写的事实，行是**折叠之后**的状态。
 * 两次写同一个实体产生两个 `CapturedWrite`，却只有一行。
 */
export interface CapturedWrite {
  /** 实体所属命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: string;

  /** 这一次写是什么操作 */
  readonly operation: WorkingTreeEntryOperation;

  /** 正向 patch；`delete` 为 `null` */
  readonly patch: WorkingTreePatch;

  /** 逆向 patch；`insert` 为 `null` */
  readonly inversePatch: WorkingTreePatch;

  /** 写入后的实体指纹 */
  readonly fingerprint: string;

  /** 这一次写的来源 */
  readonly origin: WriteEntryOrigin;

  /** 所属原子单元；完整事务的全部实体共享同一个 */
  readonly unitId: string;

  /** 所属事务；无显式事务时为 `null` */
  readonly transactionId: string | null;

  /** 触发这次捕获的 `RxDBChange`；**仅诊断**，不得作为重放数据来源 */
  readonly sourceChangeId: number | null;
}

/**
 * 折叠之后落盘的那一行（`rxdb_working_tree_entry` 的可变部分）
 *
 * @remarks
 * 不含 `id` / `branch` / `createdAt` / `updatedAt`：那四个字段由存储层与唯一约束决定，
 * 折叠规则对它们没有意见。把它们放进来只会逼着纯函数去编造主键与时间戳。
 */
export interface WorkingTreeEntryRow {
  /** 实体所属命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: string;

  /** 折叠后相对 HEAD 的净操作 */
  readonly operation: WorkingTreeEntryOperation;

  /** 最新合成的正向 patch */
  readonly patch: WorkingTreePatch;

  /** **首次捕获**的逆向 patch */
  readonly inversePatch: WorkingTreePatch;

  /** 最新一次写入后的指纹 */
  readonly fingerprint: string;

  /** 最新一次写入的来源 */
  readonly origin: WriteEntryOrigin;

  /** 最新一次写入所属的原子单元 */
  readonly unitId: string;

  /** 最新一次写入所属的事务 */
  readonly transactionId: string | null;

  /** 最新一次写入的来源 change；仅诊断 */
  readonly sourceChangeId: number | null;
}

/** 折叠的结论；三种 `kind` 与 `entryCountDelta` 一一对应，调用方不必自己数行。 */
export type FoldOutcome =
  | {
      /** 这个实体此前没有未提交单元 */
      readonly kind: 'insert';
      /** 新建的行 */
      readonly entry: WorkingTreeEntryRow;
      /** 恒为 `1` */
      readonly entryCountDelta: 1;
    }
  | {
      /** 折进了已有单元 */
      readonly kind: 'update';
      /** 折叠后的行 */
      readonly entry: WorkingTreeEntryRow;
      /** 恒为 `0` */
      readonly entryCountDelta: 0;
    }
  | {
      /** 净无变化：删掉这一行 */
      readonly kind: 'remove';
      /** 恒为 `-1`；**不是**饱和减，否则「减到零再写入」之后计数会比行数多一 */
      readonly entryCountDelta: -1;
    };

/**
 * 折叠后的净操作
 *
 * @param existing - 已有单元
 * @param write - 这一次捕获
 * @returns 相对 HEAD 的净操作
 *
 * @remarks
 * 判据只有一句话：**这一行在 HEAD 里存不存在**。
 *
 * - 已有单元是 `insert` ⇒ 这行在 HEAD 里不存在，之后怎么改都还是「本次新建」。
 * - 这次写是 `insert` 而已有单元不是 ⇒ 这行在 HEAD 里存在（先删后插、或改完又插），净效果是值变更。
 *
 * 规则 2 与它的反向共用这一个判据。写反了只有「DELETE 之后 INSERT」那一组用例会红。
 */
function foldOperation(existing: WorkingTreeEntryRow, write: CapturedWrite): WorkingTreeEntryOperation {
  if (existing.operation === 'insert') return 'insert';
  if (write.operation === 'insert') return 'update';
  return write.operation;
}

/**
 * 规则 1 前半：`patch` 取最新**合成**值
 *
 * @remarks
 * 直接覆盖的话，第一次改 `title`、第二次改 `body`，提交出去只有 `body`——第一次的编辑静默丢失。
 * 合成与覆盖在「两次改同一个字段」下结果相同，所以这条只有「两次改不同字段」能分辨。
 *
 * `delete` 把正向值整个抹掉而不是合成：删掉的行没有「删除后的字段值」这回事。
 */
function foldPatch(existing: WorkingTreeEntryRow, write: CapturedWrite): WorkingTreePatch {
  if (write.patch === null) return null;
  return { ...(existing.patch ?? {}), ...write.patch };
}

/**
 * 规则 1 后半：`inversePatch` **保持首次捕获值**
 *
 * @remarks
 * 整条折叠规则里唯一不能错的一条。取最新值的话，inverse 只能把实体退回**上一次中间态**，
 * 退不回 HEAD——而 discard 与 restore 的全部意义就是退回 HEAD。这个错误在单次写入下完全不可见，
 * 连写两次也看不出来（退回的正好是第一次写完的状态），要连写三次才暴露。
 *
 * 已有值为 `null` 同样是「首次捕获值」：首次是 `insert` 时，它的逆就是「这行本不该存在」，
 * 没有字段值可退。补上字段等于承认这行在 HEAD 里有旧值。
 *
 * 新捕获里**首次没覆盖到**的字段可以补进来——那些字段的 HEAD 值此前无人记录，补进来才退得干净；
 * 已有字段一律不被改写。
 */
function foldInversePatch(existing: WorkingTreeEntryRow, write: CapturedWrite): WorkingTreePatch {
  if (existing.inversePatch === null) return null;
  return { ...(write.inversePatch ?? {}), ...existing.inversePatch };
}

/** 从一次捕获建首行；身份、两个 patch、指纹与来源原样带上。 */
function toRow(write: CapturedWrite): WorkingTreeEntryRow {
  return {
    namespace: write.namespace,
    entity: write.entity,
    entityId: write.entityId,
    operation: write.operation,
    patch: write.patch,
    inversePatch: write.inversePatch,
    fingerprint: write.fingerprint,
    origin: write.origin,
    unitId: write.unitId,
    transactionId: write.transactionId,
    sourceChangeId: write.sourceChangeId
  };
}

/**
 * 把一次捕获折进已有的工作树单元
 *
 * @param existing - 该实体已有的未提交单元；没有则传 `undefined`
 * @param write - 这一次被捕获的写
 * @returns 建行 / 改行 / 删行，以及 `entryCount` 该怎么动
 *
 * @remarks
 * **纯函数**：不改 `existing`、不改 `write`，同样输入折两次结果相同。调用方拿到 `entry` 直接落盘，
 * 拿到 `entryCountDelta` 累加进 `rxdb_working_tree_state.entryCount`——**必须在同一事务内**，
 * 否则崩溃后冗余列与行数就此分家。
 *
 * 四条规则：
 *
 * 1. `patch` 取最新合成值，`inversePatch` 保持首次捕获值。
 * 2. `INSERT` 之后 `DELETE`（该行在 HEAD 不存在）→ 净无变化，删条目并递减计数，**不**留 `delete` 单元。
 *    留下的话，commit 会带着一条「删除一个 HEAD 里根本不存在的行」的记录，重放时要么报错要么无声跳过。
 * 3. `origin` 取最新一次写入的来源；`remote_sync` **不**被折叠豁免，照样建单元、照样计数。
 * 4. **不做值级归零**：把 UPDATE 改回 HEAD 原值不会消解成无单元，`patch` 与 `inversePatch` 完全相等
 *    时也不消解。删不删要由 HEAD 说了算，而这两份 patch 只是本地记录。这是已知取舍（见 fileoverview），
 *    不是遗漏。
 *
 * @example
 * ```ts
 * const outcome = foldWorkingTreeEntry(existingRow, capturedWrite);
 * if (outcome.kind === 'remove') await entries.delete(key);
 * else await entries.put(key, outcome.entry);
 * state.entryCount += outcome.entryCountDelta;
 * ```
 */
export function foldWorkingTreeEntry(existing: WorkingTreeEntryRow | undefined, write: CapturedWrite): FoldOutcome {
  if (existing === undefined) return { kind: 'insert', entry: toRow(write), entryCountDelta: 1 };
  // 规则 2：唯一的删除条件。
  if (existing.operation === 'insert' && write.operation === 'delete') return { kind: 'remove', entryCountDelta: -1 };
  return {
    kind: 'update',
    entry: {
      namespace: existing.namespace,
      entity: existing.entity,
      entityId: existing.entityId,
      operation: foldOperation(existing, write),
      patch: foldPatch(existing, write),
      inversePatch: foldInversePatch(existing, write),
      fingerprint: write.fingerprint,
      origin: write.origin,
      unitId: write.unitId,
      transactionId: write.transactionId,
      sourceChangeId: write.sourceChangeId
    },
    entryCountDelta: 0
  };
}

/**
 * 调用方在**读取 / 实例化实体时**捕获的 active 分支身份（FR-020）
 *
 * @remarks
 * 两个字段缺一不可：`branchId` 认「是哪条分支」，`activationRevision` 认「是第几次激活」。
 * 只留 `branchId` 的话，`main → feature → main` 一个来回之后 token 又「对上了」，而这中间
 * 工作树已经换过两轮。
 */
export interface ActiveBranchToken {
  /** 捕获时的 active 分支 ID */
  readonly branchId: string;

  /** 捕获时的 activation revision；每次切换分支 +1 */
  readonly activationRevision: number;
}

/**
 * 调用方**提出的**那份 active 分支断言（{@link StaleActiveBranchError.expected} 的类型）
 *
 * @remarks
 * 比 {@link ActiveBranchToken} 松一格，松的正是 `branchId`：写路径的调用方交的是完整捕获值
 * （`ActiveBranchToken` 直接可赋值过来），而 `switchBranch(branchId, options)` 的调用方
 * 经公开入口 `RxDBBranchSwitchPreconditions` 只交得出 `expectedActivationRevision`
 * 一个数——那个形状被一条「不多不少就这两个字段」的类型断言钉住，里面没有分支这一格。
 *
 * **`null` 写的是「没表态」，不是「不知道」。** 此前那一处拿库里**当前**的 branchId 去补，
 * 补出来的是一个从未存在过的 token（`B@3`：调用方其实在 A@3，库里是 B@7），而消费者会照着
 * `expected.branchId` 去查 B。判定本身不需要这一格：`activationRevision` 是**库级单行**
 * （`working-tree-activation-state`，每次切换 +1），单凭代际号就把激活态钉死了。
 */
export interface ExpectedActiveBranch {
  /** 调用方捕获的 active 分支 ID；`null` = 调用方只断言了代际，没对分支表态 */
  readonly branchId: string | null;

  /** 调用方捕获或断言的 activation revision */
  readonly activationRevision: number;
}

/** 工作树单元的身份三元组，对应唯一约束里除 `branch` 外的部分。 */
export interface WorkingTreeEntryKey {
  /** 实体所属命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: string;
}

/**
 * 捕获所需的持久化操作
 *
 * @remarks
 * 端口是**注入**的：捕获自己不开事务、不选适配器，它只在调用方给的那个事务上下文里按顺序发这
 * 几笔。真实事务的原子性由适配器保证（conformance 套件在 6 个后端上核验），本模块负责的是
 * **顺序、条件与副作用范围**。
 *
 * 实现方在构造时就绑定到当前分支，所以方法签名里没有 `branch`——
 * {@link captureCrudWrite} 会先校验 token，确认这条分支正是调用方以为的那条。
 */
export interface WorkingTreeCapturePort {
  /**
   * 读取库里当前持久化的 active 分支 token
   *
   * @returns 当前的分支身份
   *
   * @remarks
   * 必须读**持久化**状态。`BroadcastChannel` 或内存里的副本都不跨进程重启，
   * 而这条校验要拦的恰恰是「另一个 realm 在期间切过分支」。
   */
  readActiveBranchToken(): Promise<ActiveBranchToken>;

  /**
   * 读取该实体已有的未提交单元
   *
   * @param key - 实体身份三元组
   * @returns 已有单元；没有则为 `undefined`
   */
  readEntry(key: WorkingTreeEntryKey): Promise<WorkingTreeEntryRow | undefined>;

  /**
   * 落盘折叠结果
   *
   * @param row - 折叠后的行；`undefined` 表示**删除**该实体的单元（净无变化）
   * @param entryCountDelta - 与 `row` 同来自一次折叠，原样转交
   */
  persistEntry(row: WorkingTreeEntryRow | undefined, entryCountDelta: number): Promise<void>;

  /**
   * 递增 `workingTreeRevision`，并把 `entryCount` 加上增量
   *
   * @param entryCountDelta - 本次折叠给出的条目数变化
   * @returns 递增之后的 `workingTreeRevision`
   */
  bumpWorkingTreeRevision(entryCountDelta: number): Promise<number>;
}

/**
 * 调用方手里的 active branch token 已经过期
 *
 * @remarks
 * 抛出时业务表**零变化**：校验排在业务写入之前，不是写完再回滚。
 * 处理方式是让用户知道分支已被切换，然后用新分支重新读取实体——而不是重试同一笔写入。
 */
export class StaleActiveBranchError extends RxDBError {
  /** 稳定错误码，见 {@link CommitErrorCode.stale_active_branch} */
  readonly code = CommitErrorCode.stale_active_branch;

  /** 调用方提出的断言；`branchId` 为 `null` 表示只断言了代际（见 {@link ExpectedActiveBranch}） */
  readonly expected: ExpectedActiveBranch;

  /** 库里当前的 token */
  readonly actual: ActiveBranchToken;

  /**
   * @param expected - 调用方提出的断言
   * @param actual - 库里当前的 token
   */
  constructor(expected: ExpectedActiveBranch, actual: ActiveBranchToken) {
    // 没表态的那一半按「代际 N」写，不拿 `actual.branchId` 顶上：顶上去的消息读起来像
    // 「你持有 B@3」，而调用方从来不在 B 上。
    const held =
      expected.branchId === null ?
        `断言 activation revision 为 ${expected.activationRevision}`
      : `持有 ${expected.branchId}@${expected.activationRevision}`;
    super(
      `active 分支已被切换：写入时${held}，` +
        `库里现在是 ${actual.branchId}@${actual.activationRevision}。请在新分支上重新读取实体后再写入。`
    );
    this.expected = expected;
    this.actual = actual;
    this.name = 'StaleActiveBranchError';
    Object.setPrototypeOf(this, StaleActiveBranchError.prototype);
  }
}

/**
 * 校验调用方捕获的 token 仍然有效
 *
 * @param port - 捕获端口
 * @param expected - 调用方捕获的 token
 * @throws {@link StaleActiveBranchError} token 已过期
 *
 * @remarks
 * 校验的是**捕获到的那个 token**，不是「事务里重新读一次 active 分支」——后者是 spec.md 场景 5
 * 明令禁止的形态，它永远不会失败，代价是用户在 `feature-x` 上编辑的实体被写进 `main`。
 */
async function assertActiveBranch(port: WorkingTreeCapturePort, expected: ActiveBranchToken): Promise<void> {
  const actual = await port.readActiveBranchToken();
  if (actual.branchId === expected.branchId && actual.activationRevision === expected.activationRevision) return;
  throw new StaleActiveBranchError(expected, actual);
}

/**
 * 把一次普通 CRUD 写入包进工作树捕获的四步（FR-039）
 *
 * @typeParam TResult - 业务写入的返回类型
 * @param port - 捕获端口，由调用方绑定到当前事务
 * @param token - 调用方在读取 / 实例化实体时捕获的 active 分支 token
 * @param write - 这一次要捕获的写
 * @param businessWrite - **尚未执行**的业务写入
 * @returns `businessWrite` 的返回值，原样透传
 * @throws {@link StaleActiveBranchError} token 过期；此时 `businessWrite` 一次都没被调用
 *
 * @remarks
 * 四步顺序即契约：**校验 token → 写业务实体 → 写入或合并完整单元 → 递增 `workingTreeRevision`**。
 * 调用方必须把这四步放在**同一个事务**里，任一步失败全部回滚。
 *
 * 三处顺序不能调换：
 *
 * - **token 校验在业务写入之前。** 挪到后面就成了「先写进去再发现分支不对，靠回滚收拾」。
 *   raw 通道与批量写路径都已经为「拒绝发生在执行前」付过代价，最热的 CRUD 这条路没有理由退让。
 * - **递增排在落条目之后。** 反过来的话，条目写失败时 revision 已经 +1——而它是 commit 的 CAS
 *   依据，一次失败的 `save()` 会让另一个 Tab 手里的 revision 凭空作废。
 * - **读已有条目在落条目之前**，且读的是**库**不是内存 dirty set。刷新一次页面 dirty set 就是空的，
 *   于是 `inversePatch` 被记成刷新后的值，discard 从此退不回 HEAD，全程没有任何报错。
 *
 * `entryCount` 的增量**原样取自折叠**（{@link foldWorkingTreeEntry}），捕获不自己数：
 * 数第二遍就是第二份真相，而且是没有用例保护的那份。
 *
 * @example
 * ```ts
 * await adapter.transaction(async tx => {
 *   const port = createCapturePort(tx);
 *   return captureCrudWrite(port, entity.branchToken, toCapturedWrite(entity), () => tx.upsert(entity));
 * });
 * ```
 */
export async function captureCrudWrite<TResult>(
  port: WorkingTreeCapturePort,
  token: ActiveBranchToken,
  write: CapturedWrite,
  businessWrite: () => Promise<TResult>
): Promise<TResult> {
  await assertActiveBranch(port, token);
  const result = await businessWrite();
  const existing = await port.readEntry({ namespace: write.namespace, entity: write.entity, entityId: write.entityId });
  const outcome = foldWorkingTreeEntry(existing, write);
  await port.persistEntry(outcome.kind === 'remove' ? undefined : outcome.entry, outcome.entryCountDelta);
  await port.bumpWorkingTreeRevision(outcome.entryCountDelta);
  return result;
}
