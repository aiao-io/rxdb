/**
 * @fileoverview 捕获运行时：四个挂载点上的写怎么变成工作树单元（T058–T061、adapter-contract.md §1）。
 *
 * @remarks
 * 安装层（`capture-interceptor.ts`）只解决「拦得住吗」，本文件解决「拦到之后算什么」。两者分开
 * 是因为前者必须能在**没有数据库**的情况下被测（它只是属性改写），而后者的每条分支都要读写真表。
 *
 * **三个挂载点的捕获数据来自两个不同的源。** 挂载点 1（`transaction`）捕获的是**变更日志增量**：
 * 事务体内发生了什么，只有 `rxdb_change` 知道；把水位线读在 `fun` 之前、增量读在 `fun` 之后，
 * 中间发生的一切都在同一个事务里，不会读到别人的行。挂载点 2 / 3（`mergeChanges` /
 * `switchBranch`）反过来**不能**用增量：它们带 `disableTriggers` 形参，为真时压根不写变更日志，
 * 而 FR-046 要求此时**仍然**产生 `origin='remote_sync'` 的单元。所以这两个挂载点直接从
 * {@link SwitchVersionActions} 派生——那是它们即将写下去的东西本身，与触发器开关无关。
 *
 * **原子性。** 挂载点 1 与 2 的捕获与业务写落在**同一个事务**里：前者天然如此；后者靠
 * `host.runInTransaction()` 先要到 executor，再把业务写发到该 executor 的门面上——`mergeChanges`
 * 内部用的也是 `runInTransaction`，在门面上它被映射成「复用当前事务」。挂载点 3 做不到：
 * `switch_branch()` 内部直接调 `adapter.transaction()`（还要在前后各刷一次变更管道），
 * 嵌进一个已开的事务就是等自己占着的队列槽位。所以 `switchBranch` 的捕获是**后继事务**，
 * 与业务写之间存在一个崩溃窗口——这是 adapter-contract.md §5 的一处已知偏离，仅影响
 * 登记表第 4 行（undo/redo）：第 1、3 行是 `projection_rewrite`，本来就不产生单元。
 */

import type {
  EntityManager,
  EntityType,
  InterceptedBulkWrite,
  MergeChangesNext,
  RawWritePrimitives,
  SwitchBranchOptions,
  SwitchVersionActions,
  SwitchVersionChange,
  SyncOptions,
  TransactionExecutor,
  TransactionFun,
  WorkingTreeCaptureHook,
  WorkingTreeCaptureMountTarget,
  WorkingTreeWriteHost,
  WriteEntrance
} from '@aiao/rxdb';
import {
  getEntityMetadata,
  getEntitySync,
  getSystemEntityNames,
  RxDBChange,
  RxDBError,
  takeDeclaredWrite,
  uuid,
  type ResolvedTrustedWrite
} from '@aiao/rxdb';
import type { Observable } from 'rxjs';
import { gateBulkWrite } from './bulk-write-gate.js';
import {
  captureChanges,
  readActiveBranchToken,
  type ChangeCaptureSource,
  type WorkingTreeCaptureHost
} from './capture-runtime.js';
import { gateExternalNotify } from './external-notify-gate.js';
import { applyRawWriteJudgment } from './raw-write-judgment.js';
import { buildVersionedDomain, type VersionedDomain } from './versioned-domain.js';
import {
  classifyWriteEntrance,
  WorkingTreeWriteRejectedError,
  type WriteEntranceDecision,
  type WriteOperation,
  type WriteTargetClass
} from './write-entry-matrix.js';

/** 变更日志的类型列 → 矩阵的操作种类。 */
const OPERATION_OF_TYPE: Readonly<Record<ChangeCaptureSource['type'], WriteOperation>> = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete'
};

/** 构造捕获运行时所需的宿主能力。 */
export interface WorkingTreeCaptureRuntimeOptions {
  /** 造工作树单元实例用 */
  readonly entityManager: EntityManager;

  /** 版本化域：谁是 query cache、哪些字段不算净变化 */
  readonly domain: VersionedDomain;

  /** 系统实体名集合（`namespace: 'rxdb'`）；这些表的写永远不进工作树 */
  readonly systemEntityNames: ReadonlySet<string>;

  /** 单元 id 生成器；仅测试需要注入确定值 */
  readonly newUnitId?: () => string;
}

/** `rxdb_change` 的一行里捕获真正需要的那几列。 */
type ChangeRow = Pick<
  RxDBChange,
  'id' | 'type' | 'transactionId' | 'namespace' | 'entity' | 'entityId' | 'patch' | 'inversePatch'
>;

/** {@link SwitchVersionActions} 的三张表各自对应的变更类型。 */
const ACTION_TYPES = [
  ['inserts', 'INSERT'],
  ['updates', 'UPDATE'],
  ['deletes', 'DELETE']
] as const satisfies readonly (readonly [keyof SwitchVersionActions, ChangeCaptureSource['type']])[];

/**
 * 事务内的 executor 能交出它那张「写落在本事务里」的适配器门面
 *
 * @remarks
 * 不在 {@link TransactionExecutor} 上声明是因为门面类型属于适配器包；核心包只需要「它有
 * `runInTransaction`」这一条，结构化地问即可。问不到就**抛**而不是退回真实适配器：退回去
 * 的那条路径会让事务内的 `mergeChanges` 去排队等自己正占着的槽位，表现为永久挂起。
 */
const executorHostOf = (executor: TransactionExecutor): WorkingTreeWriteHost => {
  const host = (executor as { adapter?: WorkingTreeWriteHost }).adapter;
  if (!host) {
    throw new RxDBError(
      `事务 executor ${executor.id} 没有暴露 adapter 门面：工作树捕获无法把业务写送进本事务。` +
        '适配器的 TransactionExecutor 实现必须提供 `adapter` 取值器（见 SqliteTransactionExecutor / PGliteTransactionExecutor）。'
    );
  }
  return host;
};

/** `rxdb_change` 当前的最大 id；空表时为 0，于是「大于水位线」对第一条也成立。 */
const readChangeWatermark = async (executor: TransactionExecutor): Promise<number> => {
  const rows = await executor.getRepository(RxDBChange).find({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'id', sort: 'desc' }],
    limit: 1
  });
  return rows[0]?.id ?? 0;
};

/** 水位线之后新增的变更行，按 id 升序——捕获顺序必须与写入顺序一致，折叠才会得到同一个终态。 */
const readChangesAfter = async (executor: TransactionExecutor, watermark: number): Promise<ChangeRow[]> =>
  executor.getRepository(RxDBChange).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '>', value: watermark }] },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });

/** 变更日志行 → 待判定的捕获源。 */
const sourceOfChangeRow = (row: ChangeRow): ChangeCaptureSource => ({
  id: row.id,
  type: row.type as ChangeCaptureSource['type'],
  transactionId: row.transactionId ?? null,
  namespace: row.namespace,
  entity: row.entity,
  entityId: String(row.entityId),
  patch: (row.patch as Record<string, unknown> | null) ?? null,
  inversePatch: (row.inversePatch as Record<string, unknown> | null) ?? null
});

/**
 * {@link SwitchVersionActions} → 待判定的捕获源
 *
 * @param actions - 即将写下去的三张表
 * @returns 按 insert / update / delete 顺序展开的捕获源
 *
 * @remarks
 * `id` 与 `transactionId` 都是 `null`：这批写**可能**根本不产生变更日志行（`disableTriggers`），
 * 于是没有 change id 可引；硬塞一个会让「单元指回哪条变更」这个字段有时真有时假。
 */
const sourcesOfActions = (actions: SwitchVersionActions): ChangeCaptureSource[] => {
  const sources: ChangeCaptureSource[] = [];
  for (const [bucket, type] of ACTION_TYPES) {
    for (const [key, change] of actions[bucket] as Map<string, SwitchVersionChange>) {
      const [namespace, entity, entityId] = key.split(':');
      sources.push({
        id: null,
        type,
        transactionId: null,
        namespace,
        entity,
        entityId,
        patch: (change.patch as Record<string, unknown> | null) ?? null,
        inversePatch: (change.inversePatch as Record<string, unknown> | null) ?? null
      });
    }
  }
  return sources;
};

/**
 * 捕获运行时
 *
 * @remarks
 * 一个数据库一个实例，由 `RxDB.connect()`（能力位已开）或 `workingTree.enable()`（刚翻开）
 * 装到本地适配器上。没启用提交能力的库上这个类一次都不会被构造。
 */
export class WorkingTreeCaptureRuntime implements WorkingTreeCaptureHook {
  readonly #host: WorkingTreeCaptureHost;
  readonly #domain: VersionedDomain;
  readonly #systemEntityNames: ReadonlySet<string>;
  readonly #newUnitId: () => string;
  #target: WorkingTreeCaptureMountTarget | undefined;

  /**
   * 本运行时认的那份版本化域
   *
   * @remarks
   * **不在核心的 {@link WorkingTreeCaptureHook} 契约上**：核心一次都不读它。摆上去等于让核心
   * 替「判定认什么」的形状背书，而那正是随捕获规则变、必须留在本包的东西。
   *
   * 暴露在类上是给本包自己与一致性套件用的：套件要在**表 / 列平面**核对「哪些表受保护」，
   * 而那份清单只有运行时手上有。交出的是清单本身不是拷贝——拷一份出来之后，插件后续登记的
   * 派生索引列只会落进其中一份，raw 通道与捕获会对同一张表给出不同结论。
   */
  get domain(): VersionedDomain {
    return this.#domain;
  }

  /**
   * 由 {@link createWorkingTreeCaptureRuntime} 构造；没启用提交能力的库上一次都不会被调到。
   *
   * @param options - 四项依赖，见 {@link WorkingTreeCaptureRuntimeOptions}
   *
   * @remarks
   * 四项全部注入且构造后不可换：版本化域与系统表名集在这里定格，于是「这张表受不受保护」
   * 在本运行时的整个生命周期里只有一个答案。构造器**不**碰挂载目标——`#target` 由
   * {@link bindMountTarget} 在装到适配器上的那一刻才写入，因此同一个运行时可以先造出来、
   * 再决定装到哪个适配器上。
   */
  constructor(options: WorkingTreeCaptureRuntimeOptions) {
    this.#host = { entityManager: options.entityManager };
    this.#domain = options.domain;
    this.#systemEntityNames = options.systemEntityNames;
    this.#newUnitId = options.newUnitId ?? uuid;
  }

  /**
   * @inheritDoc
   *
   * @remarks
   * **只认领 `target`，不留 `raw`。** 本运行时自己发的写全部落在挂载点 1 拿到的那个事务
   * executor 上（见 {@link createWorkingTreeCapturePort}），那条路本来就在拦截层之内，
   * 不会递归回挂载点。留一份用不上的原语引用，等于给「绕过当前事务直接写库」留一个现成把手。
   */
  bindMountTarget(target: WorkingTreeCaptureMountTarget): void {
    this.#target = target;
  }

  /**
   * 挂载点 1：整事务共享一个 `unitId`
   *
   * @remarks
   * 水位线读在 `fun` 之前、增量读在 `fun` 之后，两次都用**同一个** executor：换成适配器级读取
   * 会在事务外看见一个尚未提交的区间，捕获到的行数取决于别的事务提交得多快。
   *
   * 没有意图声明时入口是 `crud` 而不是拒绝——`transaction()` 是所有业务写的正常通道，
   * 对它 fail-closed 等于把整个库变成只读。受信路径的 fail-closed 落在挂载点 2 / 3 上。
   */
  async interceptTransaction(
    _host: WorkingTreeWriteHost,
    next: RawWritePrimitives['transaction'],
    fun: TransactionFun,
    transactionLog?: boolean
  ): Promise<unknown> {
    const body: TransactionFun = async executor => {
      const watermark = await readChangeWatermark(executor);
      const value = await fun(executor);
      const declared = takeDeclaredWrite(executor);
      const rows = await readChangesAfter(executor, watermark);
      await this.#capture(executor, rows.map(sourceOfChangeRow), declared?.entrance ?? 'crud');
      return value;
    };
    return next(body, transactionLog);
  }

  /**
   * 挂载点 2：本地 `mergeChanges`
   *
   * @remarks
   * 业务写与捕获共用 `host.runInTransaction()` 要来的那一个事务：`mergeChanges` 内部走的也是
   * `runInTransaction`，把它发到该事务 executor 的门面上，它就复用而不是新开。于是
   * 「写了业务表却没留下单元」在这个挂载点上不存在崩溃窗口。
   */
  async interceptMergeChanges(
    host: WorkingTreeWriteHost,
    next: MergeChangesNext,
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers?: boolean
  ): Promise<number | void> {
    return host.runInTransaction(async executor => {
      const entrance = this.#requireEntrance(executor, 'mergeChanges');
      const result = await next(executorHostOf(executor), actions, localChanges, disableTriggers);
      await this.#capture(executor, sourcesOfActions(actions), entrance);
      return result;
    }, false);
  }

  /**
   * 挂载点 3：`switchBranch`
   *
   * @remarks
   * 拒绝判定在 `next()` **之前**同步完成，所以未登记的调用一行业务数据都改不了。捕获则只能在
   * `next()` 之后另开事务——`switch_branch()` 自己要开事务并在前后刷变更管道，包不进来。
   * 见本文件顶部关于 §5 偏离的说明。
   */
  async interceptSwitchBranch(
    host: WorkingTreeWriteHost,
    next: RawWritePrimitives['switchBranch'],
    options: SwitchBranchOptions
  ): Promise<void> {
    const entrance = this.#requireEntrance(undefined, 'switchBranch');
    const sources = sourcesOfActions(options.actions);
    await next(options);
    await host.runInTransaction(executor => this.#capture(executor, sources, entrance), false);
  }

  /**
   * 挂载点 4：`upsertMany` / `deleteByIds` 的门禁
   *
   * @remarks
   * 同步转发，中间没有 `await`：门禁必须在 Observable 存在之前抛（adapter-contract.md §1.1）。
   */
  interceptBulkWrite(
    _host: WorkingTreeWriteHost,
    next: () => Observable<void>,
    entityName: string,
    operation: InterceptedBulkWrite
  ): Observable<void> {
    return gateBulkWrite(
      { entityName, operation, targetClass: this.targetClassOf(entityName), capabilityEnabled: true },
      next
    );
  }

  /**
   * 实体名 → 写入口语义矩阵里的目标类别
   *
   * @param entityName - 实体名
   * @param namespace - 已知时直接用；`rxdb` 即系统表
   * @returns `system` / `query_cache` / `versioned` 三者之一
   *
   * @remarks
   * 全部系统实体都是 `namespace: 'rxdb'`，所以命名空间已知时一问即答；只有实体名的场合
   * （挂载点 4）回落到系统实体名集合。两条路给出的是同一个答案，不是两份清单——集合本身就是
   * 造运行时那一刻从核心系统实体注册表（{@link getSystemEntityNames}）的元数据算出来的。
   *
   * 与 {@link domain} 同理**不在核心契约上**：核心的 `notifyExternalUpdate()` 从前要自己问一次
   * 归类再把结果送进门禁，现在只交出实体身份、整段判定走 {@link gateExternalNotify}。
   * 于是「归哪一类」这件事在核心侧一次都不出现。
   */
  targetClassOf(entityName: string, namespace?: string): WriteTargetClass {
    if (namespace === 'rxdb' || this.#systemEntityNames.has(entityName)) return 'system';
    return this.#domain.classifyEntity(entityName) === 'untracked' ? 'query_cache' : 'versioned';
  }

  /**
   * @inheritDoc
   *
   * @remarks
   * `capabilityEnabled` 恒为 `true`：运行时只在能力位为真时被装上，而核心的 `gateRawWrite`
   * 在能力位为假时压根不会转交到这里。再判一次就是第二份真相。
   */
  gateRawWrite<T>(sql: string, execute: () => Promise<T> | T): Promise<T> {
    return applyRawWriteJudgment(sql, { capabilityEnabled: true, domain: this.#domain }, execute);
  }

  /**
   * @inheritDoc
   *
   * @remarks
   * 归类与判定都不在这里另写一份：类别问 {@link targetClassOf}，放拒问
   * {@link gateExternalNotify}——也就是写入口语义矩阵行 11 那一份。能力位恒为 `true`，
   * 理由同 {@link gateRawWrite}。
   */
  gateExternalNotify<T>(entityName: string, namespace: string | undefined, notify: () => T): T {
    return gateExternalNotify(
      { entityName, targetClass: this.targetClassOf(entityName, namespace), capabilityEnabled: true },
      notify
    );
  }

  /**
   * 取出本次写的入口，没有声明就拒绝
   *
   * @param executor - 事务内调用时的作用域键；适配器级调用传 `undefined`
   * @param method - 出现在拒绝信息里的原语名
   * @returns 登记表解析出的写入口
   * @throws {@link WorkingTreeWriteRejectedError} 两个作用域上都没有声明时
   *
   * @remarks
   * 先问 executor 再问适配器：事务内的调用（登记表 #5/#7/#8/#9）把声明放在 executor 上，
   * 适配器级调用（#1/#2/#3/#4/#6）放在适配器上。反过来先问适配器的话，一次适配器级声明会被
   * 紧随其后的事务内写取走。
   */
  #requireEntrance(executor: TransactionExecutor | undefined, method: string): WriteEntrance {
    const declared = this.#takeDeclaration(executor);
    if (declared) return declared.entrance;
    throw new WorkingTreeWriteRejectedError({
      entrance: 'raw_write',
      message:
        `${method}() 没有声明受信写意图：工作树无法判断这次批量重写该不该产生单元。` +
        '在调用点先调 declareTrustedWrite()，并把它加进 TRUSTED_CALLSITE_REGISTRY（adapter-contract.md §3）。'
    });
  }

  /** 按「事务作用域优先」取用一次声明；取用即清除。 */
  #takeDeclaration(executor: TransactionExecutor | undefined): ResolvedTrustedWrite | undefined {
    const fromExecutor = executor ? takeDeclaredWrite(executor) : undefined;
    if (fromExecutor) return fromExecutor;
    return this.#target ? takeDeclaredWrite(this.#target) : undefined;
  }

  /**
   * 判定一批写，把其中要捕获的那些落成一个单元
   *
   * @param executor - 业务写所在的事务
   * @param sources - 待判定的捕获源
   * @param entrance - 本次写的入口
   * @returns 落成单元的条数
   * @throws {@link WorkingTreeWriteRejectedError} 任何一条被判成 `reject` 时
   *
   * @remarks
   * 拒绝**先于**捕获整批检查完：一半落单元一半抛错的话，工作树里会留下一个没有对应业务写的
   * 半截单元。
   *
   * 整批共享一个 `origin`，因为 origin 只由入口决定（见矩阵的 `CAPTURING_ENTRANCES`），
   * 而一次写原语只有一个入口。取第一条的 origin 不是近似，是同一个值。
   */
  async #capture(
    executor: TransactionExecutor,
    sources: readonly ChangeCaptureSource[],
    entrance: WriteEntrance
  ): Promise<number> {
    const decided = sources.map(source => ({ source, decision: this.#classify(source, entrance) }));
    const rejected = decided.find(item => item.decision.kind === 'reject');
    if (rejected) {
      throw new WorkingTreeWriteRejectedError({
        entrance,
        entityName: rejected.source.entity,
        message: `${entrance} 入口不允许写版本化业务实体 ${rejected.source.entity}：它绕开工作树捕获。`
      });
    }
    const capturing = decided.filter(item => item.decision.kind === 'capture');
    const first = capturing[0];
    if (!first || first.decision.kind !== 'capture') return 0;
    const token = await readActiveBranchToken(executor);
    return captureChanges(executor, this.#host, {
      token,
      unitId: this.#newUnitId(),
      origin: first.decision.origin,
      changes: capturing.map(item => item.source),
      shouldCapture: () => true
    });
  }

  /** 单条捕获源的入口判定；三个平面的取值都从域里问，不在这里另存一份。 */
  #classify(source: ChangeCaptureSource, entrance: WriteEntrance): WriteEntranceDecision {
    const columns = source.patch ? Object.keys(source.patch) : [];
    return classifyWriteEntrance({
      entrance,
      targetClass: this.targetClassOf(source.entity, source.namespace),
      operation: OPERATION_OF_TYPE[source.type],
      columns: source.patch ? { kind: 'columns', names: columns } : { kind: 'whole_row' },
      untrackedFields: columns.filter(name => this.#domain.isUntrackedField(source.entity, name)),
      capabilityEnabled: true
    });
  }
}

/**
 * 按一个库的实体登记造出捕获运行时
 *
 * @param entityManager - 捕获时用来实例化工作树单元
 * @param entities - 这个库注册的全部业务实体（`rxdb.config.entities`）
 * @param databaseSync - 库级同步配置（`rxdb.config.sync`）；实体自身没登记 `sync` 时由它生效
 * @returns 可直接交给 `adapter.setWorkingTreeCaptureHook()` 的运行时
 * @throws RxDBError 某个实体解析不出生效的同步配置时
 *
 * @remarks
 * 同步策略走 {@link getEntitySync} 而不是直接读 `metadata.sync`：「实体优先、否则继承库级」
 * 这条规则已经有一份实现，在这里重写一遍就等于给 `QueryCache` 的判定开了第二个入口——
 * 而版本化域里唯一按 `syncType` 分叉的判断正是「是不是 QueryCache」。两处一旦分叉，
 * 症状是某张缓存表的行开始被捕获成用户编辑，追起来要穿过整条捕获链。
 *
 * 解析不出同步配置时抛而不是当作 `Full`：`RxDBConfig.sync` 是必填的，所以这个分支在正常构造
 * 下走不到；真走到了说明配置形状已经不是这里以为的样子，此时按「不是 QueryCache」继续，
 * 只会把一张缓存表静默地纳入版本化。
 */
export const createWorkingTreeCaptureRuntime = (
  entityManager: EntityManager,
  entities: readonly EntityType[],
  databaseSync: SyncOptions
): WorkingTreeCaptureRuntime =>
  new WorkingTreeCaptureRuntime({
    entityManager,
    domain: buildVersionedDomain(
      entities.map(EntityType => {
        const metadata = getEntityMetadata(EntityType);
        const sync = getEntitySync(EntityType, databaseSync);
        if (!sync) throw new RxDBError(`实体 ${metadata.name} 解析不出生效的同步配置，无法判定它是否版本化。`);
        return {
          entityName: metadata.name,
          namespace: metadata.namespace,
          tableName: metadata.tableName,
          syncType: sync.type
        };
      })
    ),
    systemEntityNames: getSystemEntityNames()
  });
