/**
 * @fileoverview `workingTreeCaptureConformanceSuite` —— 捕获侧一致性套件。
 *
 * @remarks
 * 覆盖范围见 `specs/001-working-tree-commits/contracts/conformance-suites.md` §1：
 * 四个挂载点的捕获完备性、写入口语义矩阵、raw 通道 bypass 四步判定、untracked 域、
 * 存储契约静态断言。
 *
 * **每组末尾都跑冷重放不变量**（§1.1 明文要求）。判据只有这一条：
 * `HEAD 投影 + 全部工作树单元` 重放出来的净状态，必须与业务表实际内容逐字段相等。
 * 计数式断言（「改了 3 行就该有 3 个单元」）两个方向都测不到——折叠规则让计数天然对不上，
 * 而一个漏列的 patch 计数分毫不差。
 *
 * **HEAD 投影由调用方给，默认为空。** 契约 §0 规定工厂每次交还全新实例，本套件里没有任何一条
 * 用例调过 `commit()`，所以绝大多数组的 HEAD 上一行业务数据都没有——`insert` 单元的净状态只来自
 * patch（不掺 HEAD），而触发器给出的 INSERT patch 是整行，空 HEAD 上重放因此能还原出完整业务行。
 * 唯一的例外是 `projection_rewrite` 那几组：投影重写按契约**不产生单元**，它落下的业务行在工作树里
 * 没有对应物，只能作为 HEAD 交给不变量——这正是「HEAD 投影」这个形参存在的理由。
 *
 * **本套件与提交侧套件共用实体清单**（{@link WORKING_TREE_CONFORMANCE_ENTITIES}）。提交侧
 * 只碰系统表，`entities: []` 就够；捕获侧不行——「捕获是否完备」是关于**业务写**的命题。
 *
 * **每条用例一个全新数据库**，理由与提交侧套件相同：契约里没有 teardown 钩子，共享实例会让
 * 上一条用例的残留变成下一条的隐藏前置。
 *
 * @module @aiao/rxdb-plugin-working-tree/testing
 */

import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  EntityType,
  IRxDBChange,
  LocalRxDBAdapter,
  RxDB,
  SwitchVersionActions,
  TransactionExecutor,
  UUID
} from '@aiao/rxdb';
import {
  declareTrustedWrite,
  gateRawWrite,
  getEntityMetadata,
  getRxDBChangeKey,
  isSystemEntity,
  RxDBBranch,
  RxDBChange,
  RxDBMigration,
  RxDBMixedVersionedCacheTransactionError,
  RxDBSync,
  SKIP_BRANCH_SWITCH_PREPARE,
  SyncType,
  SYSTEM_ENTITIES,
  TrustedWriteIntent,
  uuid,
  WRITE_ENTRANCES,
  type TrustedWriteDeclaration,
  type WriteEntrance
} from '@aiao/rxdb';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { Commit } from '../../commit/commit.entity.js';
import { branchMaterializationPageFingerprint } from '../branch-materialization.js';
import { WorkingTreeCaptureRuntime } from '../capture-hook.js';
import { assertColdReplayInvariant, type ColdReplayRow, type ColdReplaySnapshot } from '../cold-replay.js';
import type { BranchMaterializationSource } from '../materialize-branch.js';
import { judgeRawWrite, type RawWriteJudgmentContext } from '../raw-write-judgment.js';
import { UNTRACKED_BOOKKEEPING_FIELDS, type VersionedDomainView } from '../versioned-domain.js';
import { WorkingTreeActivationState } from '../working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../working-tree-entry.entity.js';
import { WorkingTreeMaterializationPage } from '../working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from '../working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../working-tree-state.entity.js';
import { classifyWriteEntrance, WorkingTreeWriteRejectedError } from '../write-entry-matrix.js';
import { ConformanceCache, ConformanceNote, WORKING_TREE_CONFORMANCE_ENTITIES } from './conformance-entities.js';
import type { WorkingTreeConformanceSuiteContext } from './suite-context.js';

/** 取本地适配器；受信写声明与 raw 判定上下文都挂在这个实例上。 */
const localAdapterOf = (database: RxDB): Promise<LocalRxDBAdapter> => firstValueFrom(database.localAdapter$);

/**
 * 取本地适配器上的捕获运行时
 *
 * @param adapter - 被测库的本地适配器
 * @returns 这个库的捕获运行时
 * @throws Error 钩子没挂上，或挂的不是本包的运行时
 *
 * @remarks
 * 交出的是本包的 {@link WorkingTreeCaptureRuntime} 而不是核心契约 `WorkingTreeCaptureHook`：
 * 核心那张契约上只有它自己会调的成员，`domain` 与 `targetClassOf()` 都不在其列——捕获语义随
 * 本包走，核心不替它的形状背书。本套件恰恰要核对这两样，所以只能从运行时这一侧取。
 *
 * 用 `instanceof` 而不是类型断言：装在适配器上的钩子按类型只是核心契约，断言下来的话，
 * 哪天换了个别的实现装上去，本套件会在 `undefined.domain` 上炸得莫名其妙而不是说出真正的原因。
 *
 * 钩子缺席时抛而不是跳过：`workingTree.enable()` 没生效的库上，本节全部断言都会以
 * 「归类为 versioned」的形态假绿。
 */
const hookOf = (adapter: LocalRxDBAdapter): WorkingTreeCaptureRuntime => {
  const hook = adapter.workingTreeCaptureHook;
  if (!hook) throw new Error('本地适配器上没有捕获钩子：工作树没有启用，本节的全部前置都无从谈起');
  if (!(hook instanceof WorkingTreeCaptureRuntime)) {
    throw new Error('本地适配器上挂的不是本包的捕获运行时：本套件核对的是这一份实现的语义');
  }
  return hook;
};

/**
 * 取这个库的版本化域（表 / 列平面）
 *
 * @param adapter - 被测库的本地适配器
 * @returns 生产域本身，不是拷贝
 *
 * @remarks
 * **不从 `adapter.workingTreeRawWriteContext` 上取**：那是适配器与核心之间的接缝，未启用形态在
 * 类型上就没有域可读（{@link RawWriteContext} 是个判别联合）。域是判定的输入，只在运行时手上。
 */
const domainOf = (adapter: LocalRxDBAdapter): VersionedDomainView => hookOf(adapter).domain;

/**
 * 凑一份「已启用」的判定上下文
 *
 * @param adapter - 被测库的本地适配器
 * @returns 能力位为真的判定上下文
 *
 * @remarks
 * 能力位恒为真：本套件只跑在已启用提交能力的库上。唯一的例外是 §1.3 第 1 步——它要的正是
 * 能力位为假，所以那一条自己现造，不走这里。
 */
const judgmentContextOf = (adapter: LocalRxDBAdapter): RawWriteJudgmentContext => ({
  capabilityEnabled: true,
  domain: domainOf(adapter)
});

/**
 * 一个新的业务实体 id
 *
 * @remarks
 * 不能写 `'undo-1'` 这种自描述字面量：`EntityBase` 把 `id` 声明成 `PropertyType.uuid`，
 * 于是 PGlite 会把它建成 Postgres 的 `uuid` 列并在插入时校验格式，而 SQLite 系后端的同名列
 * 不校验。可读的假 id 因此会让同一份套件在一半后端上绿、另一半上以 `22P02` 报错——那是套件
 * 自己制造的后端差异，而 SC-006 要它发现的是**实现**的差异。
 */
const newEntityId = (): UUID => uuid();

/** 开一个写事务跑一段命令体，语义与门面 `runEnabled()` 走的是同一条路。 */
const withTransaction = async <T>(database: RxDB, run: (executor: TransactionExecutor) => Promise<T>): Promise<T> => {
  const adapter = await localAdapterOf(database);
  return adapter.transaction(async executor => run(executor));
};

/**
 * 读当前激活分支的 id
 *
 * @remarks
 * `activated` 在 JS 侧过滤而不是下推进 WHERE：布尔字面量在六个后端上写法不一，下推等于让
 * 套件自己长出后端分支。提交侧套件里那一份同理由、同写法。
 */
const readActiveBranchId = async (executor: TransactionExecutor): Promise<string> => {
  const branches = await executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } });
  const active = branches.find(branch => branch.activated);
  if (!active) throw new Error('这个库没有激活分支，套件的全部前置都无从谈起');
  return active.id;
};

/** 读工作树单元全表，**跨分支**——「切分支时在别的分支上写了单元」只有全表读得见。 */
const readAllEntries = async (executor: TransactionExecutor): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({ where: { combinator: 'and', rules: [] } });

/**
 * 读**当前分支**的未提交单元
 *
 * @remarks
 * 冷重放必须按分支收窄，不是洁癖：唯一索引是 `(branchId, namespace, entity, entityId)`，
 * 两条分支上同一行各有一个单元完全合法，而 `replayWorkingTree` 见到同一身份两行会直接
 * 判工作树损坏。业务表里躺着的又只有**当前分支**的投影，跨分支重放本来也对不上。
 */
const readEntries = async (executor: TransactionExecutor): Promise<WorkingTreeEntry[]> => {
  const branchId = await readActiveBranchId(executor);
  const rows = await readAllEntries(executor);
  return rows.filter(row => row.branchId === branchId);
};

/** 工作树状态行的**值快照**；只装断言真正会读的两个计数。 */
interface WorkingTreeStateSnapshot {
  /** 工作树修订号 */
  readonly workingTreeRevision: number;
  /** 未提交单元条数 */
  readonly entryCount: number;
}

/**
 * 读工作树状态行，按值拷出来
 *
 * @param executor - 读所在的事务
 * @returns 这一刻的修订号与单元条数
 *
 * @remarks
 * **返回快照而不是实体，是这一节全部「前后对比」断言能不能成立的前提。**
 * `EntityIdentityCache` 保证「同一条记录在同一个 EntityManager 里只有一个实例」，
 * 于是 `before` 与 `after` 两次读拿到的是**同一个活对象**——断言时两边同时取到写后的值：
 * `toBe(before.x)` 恒真（假绿），`toBeGreaterThan(before.x)` 恒假。前者更危险：
 * 「这条入口不推进修订号」这类断言会在实现真的推进了修订号时照样报绿。
 *
 * 只拷两个计数、不整体浅拷：整表拷贝会把实体代理上的状态位一起带出来，
 * 而这一节从不读它们，多带只会让「快照」这件事看起来像别的东西。
 */
const readWorkingTreeState = async (executor: TransactionExecutor): Promise<WorkingTreeStateSnapshot> => {
  const rows = await executor.getRepository(WorkingTreeState).find({ where: { combinator: 'and', rules: [] } });
  expect(rows, '工作树状态行不是恰好一行').toHaveLength(1);
  const { workingTreeRevision, entryCount } = rows[0];
  return { workingTreeRevision, entryCount };
};

/** 严格 ISO-8601 时刻字面量；宽松匹配会把普通业务文本误判成时间。 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * 把一个列值归一成可跨侧比较的形态
 *
 * @param value - 列值
 * @returns 时刻归一成 ISO 串，其余原样
 *
 * @remarks
 * **这不是宽松化，是把两侧放到同一个刻度上。** `working-tree-patch-codec` 只接在
 * `commit/commit-codec.ts` 上，捕获路径没有经过它，于是 patch 里的时刻穿过 json 列回来是
 * **字符串**，而业务表同一列由驱动还原成 `Date`。冷重放的 `deepEqual` 专门处理 `Date`↔`Date`，
 * 却让 `Date`↔`string` 永远不等——不归一的话，每个后端上每一行都会假红。
 *
 * **不能改成「只比某几列」。** 那样一个把 `body` 列丢掉的 patch 就能通过，而这正是冷重放要抓的。
 * 归一只动表示形式，不动列集：列少一个照样报 `field_mismatch`。
 */
const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && ISO_INSTANT.test(value)) return new Date(value).toISOString();
  return value;
};

/**
 * 主键列名
 *
 * @remarks
 * 变更日志的 patch / inversePatch **不含 `id`**，主键只记在 `entityId` 上（`system/change.ts`
 * 的 `patch` / `inversePatch` TSDoc 把这条写成了契约，PGlite 触发器里对应的是
 * `to_jsonb(NEW.id::text)` 单独拼进 entityId 信封而不进 `jsonb_build_object`）。工作树单元的
 * patch 原样继承这条。
 *
 * 于是业务表投影里也必须把它摘掉，否则**每一行都会假红**：重放侧永远 `undefined`，业务表侧
 * 永远有值。这不是 {@link normalizeValue} 禁止的「只比某几列」——身份三列是由 `identityKey`
 * 比的，主键在那里已经**逐字符比过一次**；留在 `fields` 里只是把同一列比两遍。
 */
const PRIMARY_KEY_COLUMN = 'id';

/**
 * 冷重放两侧都要摘掉的列：主键 + 该实体的 untracked 簿记列
 *
 * @param domain - 生产域本身，不是套件另造的一份
 * @param EntityClass - 业务实体
 * @returns 不参与逐字段比对的列名集合
 *
 * @remarks
 * **摘 untracked 列是矩阵逼出来的，不是为了让用例好过。** 行 4（只更新 `remoteId` / 水位 /
 * 审计时间）要求那种写**不产生单元**——写完之后业务表的 `updatedAt` 变了、工作树里一个字没有。
 * 把这些列留在比对里，那一组的冷重放必然报 `field_mismatch`，而它恰恰是在验一个**正确**的行为。
 *
 * 列名从 `domain.untrackedFieldsOf()` 现问，不在套件里抄一份：抄的那份哪天与生产域分叉，
 * 冷重放会安静地开始比一个生产侧根本不打算保证的列。
 */
const excludedColumnsOf = (domain: VersionedDomainView, EntityClass: EntityType): ReadonlySet<string> => {
  const metadata = getEntityMetadata(EntityClass);
  return new Set<string>([PRIMARY_KEY_COLUMN, ...domain.untrackedFieldsOf(metadata.tableName)]);
};

/** 实体名 → 该实体的排除列集；单元只带实体名，比对时按名字查。 */
const exclusionsOf = (domain: VersionedDomainView): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map(
    WORKING_TREE_CONFORMANCE_ENTITIES.map(EntityClass => [
      getEntityMetadata(EntityClass).name,
      excludedColumnsOf(domain, EntityClass)
    ])
  );

/** 逐列归一并摘掉排除列；键集只少排除列，别的一列不动（见 {@link normalizeValue}）。 */
const projectFields = (
  fields: Readonly<Record<string, unknown>>,
  excluded: ReadonlySet<string>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(([column]) => !excluded.has(column))
      .map(([column, value]) => [column, normalizeValue(value)])
  );

/** 单元的 patch 归一；其余列原样——冷重放只读身份三列 + `operation` + `patch`。 */
const projectEntry = (
  entry: WorkingTreeEntry,
  exclusions: ReadonlyMap<string, ReadonlySet<string>>
): WorkingTreeEntry =>
  ({
    ...entry,
    patch: entry.patch === null ? null : projectFields(entry.patch, exclusions.get(entry.entity) ?? new Set())
  }) as WorkingTreeEntry;

/** HEAD 投影行按同一套规则收窄，否则它与业务表侧比的不是同一个列集。 */
const projectRow = (row: ColdReplayRow, exclusions: ReadonlyMap<string, ReadonlySet<string>>): ColdReplayRow => ({
  namespace: row.namespace,
  entity: row.entity,
  entityId: row.entityId,
  fields: projectFields(row.fields, exclusions.get(row.entity) ?? new Set())
});

/**
 * 把一张业务表读成冷重放快照
 *
 * @param executor - 调用方那个事务的执行器
 * @param EntityClass - 业务实体
 * @param excluded - 不参与比对的列
 * @returns 该表全部行
 *
 * @remarks
 * 走 `SELECT *` 而不是 Repository：Repository 会按实体元数据挑列、还原关系，于是「触发器写了
 * 一个元数据里没有的列」这类缺陷会被它顺手抹平。物理表名由 `executor.tableRef()` 给，六个后端
 * 的命名差异（Postgres 的 `"public"."x"` 与 SQLite 家族的 `"public$x"`）都落在它里面。
 */
const readBusinessRows = async (
  executor: TransactionExecutor,
  EntityClass: EntityType,
  excluded: ReadonlySet<string>
): Promise<ColdReplayRow[]> => {
  const metadata = getEntityMetadata(EntityClass);
  const result = await executor.query(`SELECT * FROM ${executor.tableRef(EntityClass)}`);
  const idIndex = result.columns.indexOf(PRIMARY_KEY_COLUMN);
  expect(idIndex, `${metadata.name} 的 SELECT * 里没有 ${PRIMARY_KEY_COLUMN} 列`).toBeGreaterThanOrEqual(0);
  return result.rows.map(row => ({
    namespace: metadata.namespace,
    entity: metadata.name,
    entityId: String(row[idIndex]),
    fields: projectFields(Object.fromEntries(result.columns.map((column, index) => [column, row[index]])), excluded)
  }));
};

/**
 * 读一张业务表某一列的全部取值
 *
 * @param executor - 调用方那个事务的执行器
 * @param EntityClass - 业务实体
 * @param column - 列名
 * @returns 该列在表里的全部取值，行序按后端的 `SELECT *` 原样给
 *
 * @remarks
 * 「执行前拒绝」与「写完回滚」在事务外看起来一模一样——两者都让业务表停在原值上。分开它们要两
 * 条证据：执行器一次都没被调用（调用方自己数），以及这一列确实还是原值（这个助手给）。只数调用
 * 次数的话，一个「先执行、再按判定回滚」的实现会以全绿通过。
 *
 * 和 {@link readBusinessRows} 一样走 `SELECT *` 而不是 Repository：Repository 会按实体元数据
 * 挑列，一次打在元数据之外的 raw 写正好会被它抹平。
 */
const readColumnValues = async (
  executor: TransactionExecutor,
  EntityClass: EntityType,
  column: string
): Promise<unknown[]> => {
  const result = await executor.query(`SELECT * FROM ${executor.tableRef(EntityClass)}`);
  const index = result.columns.indexOf(column);
  expect(index, `${getEntityMetadata(EntityClass).name} 的 SELECT * 里没有 ${column} 列`).toBeGreaterThanOrEqual(0);
  return result.rows.map(row => row[index]);
};

/**
 * 冷重放要比对的实体
 *
 * @remarks
 * 只有 tracked 实体在版本化域里（`versioned-domain.ts` 建 `versionedTables` 时就是这么筛的）。
 * 把 QueryCache 实体也拉进来的话，一次合法的 `upsertMany('ConformanceCache', …)` 会立刻被报成
 * `business_only_row`——而「QueryCache 写不进工作树」恰恰是 §1.4 要求的行为。
 *
 * 用 `sync.type` 现算而不是另写一份清单：清单里哪天多一个实体，这里自动跟上；手写第二份的话，
 * 漏改的那天不会有任何编译错误，只会让新实体悄悄退出唯一判据。
 */
const TRACKED_CONFORMANCE_ENTITIES: readonly EntityType[] = WORKING_TREE_CONFORMANCE_ENTITIES.filter(
  EntityClass => getEntityMetadata(EntityClass).sync?.type !== SyncType.QueryCache
);

/**
 * 冷重放不变量——每组末尾都跑这一条
 *
 * @param database - 被测库
 * @param head - HEAD 业务投影；只有 `projection_rewrite` 落下的行需要它，默认为空
 * @returns 无
 * @throws {@link ColdReplayMismatchError} 重放结果与业务表对不上
 */
const expectColdReplayIntact = async (database: RxDB, head: ColdReplaySnapshot = []): Promise<void> => {
  const adapter = await localAdapterOf(database);
  const exclusions = exclusionsOf(domainOf(adapter));
  await withTransaction(database, async executor => {
    const entries = await readEntries(executor);
    const actual: ColdReplayRow[] = [];
    for (const EntityClass of TRACKED_CONFORMANCE_ENTITIES) {
      const metadata = getEntityMetadata(EntityClass);
      actual.push(...(await readBusinessRows(executor, EntityClass, exclusions.get(metadata.name) ?? new Set())));
    }
    assertColdReplayInvariant({
      head: head.map(row => projectRow(row, exclusions)),
      entries: entries.map(entry => projectEntry(entry, exclusions)),
      actual
    });
  });
};

/**
 * 断言一次写被工作树门禁拒绝，并把拒绝本身交回来
 *
 * @param run - **还没被调用的**写；同步抛与 reject 两种形态都收
 * @returns 那次拒绝，供调用方继续断言 `entrance` / `code` / `entityName`
 * @throws Error 这次写没有被拒
 *
 * @remarks
 * 不用 `expect(...).rejects.toThrow()`：矩阵里三行的判据是**错误上带的字段**（行 9/10/11 各自
 * 的 `entrance`，以及行 10/11 共有的稳定错误码），而 `toThrow()` 只看得到构造器与消息。
 *
 * `await run()` 同时覆盖两种抛法：挂载点 4 的门禁按契约在 Observable 存在之前**同步**抛，
 * 而 `gateRawWrite()` 交出的是 reject 的 Promise。分成两个助手的话，哪天某个挂载点从同步抛
 * 改成异步抛，用例会以「没被拒绝」的形态假绿。
 */
const expectWriteRejected = async (run: () => unknown): Promise<WorkingTreeWriteRejectedError> => {
  try {
    await run();
  } catch (error) {
    expect(error, '抛出来的不是工作树门禁的拒绝').toBeInstanceOf(WorkingTreeWriteRejectedError);
    return error as WorkingTreeWriteRejectedError;
  }
  throw new Error('期望这次写被工作树门禁拒绝，它却通过了');
};

/** 造一条业务实体实例；`id` / 审计列由实体默认值给。 */
const noteOf = (title: string, body: string | null): ConformanceNote => {
  const note = new ConformanceNote();
  note.title = title;
  note.body = body;
  return note;
};

/**
 * 一条 `ConformanceNote` 的**整行** patch
 *
 * @param title - 标题
 * @param body - 正文
 * @returns 除主键外的全部业务列
 *
 * @remarks
 * 必须把 `createdBy` / `updatedBy` 显式写成 `null`，哪怕它们可空：`mergeChanges` /
 * `switchBranch` 走的是「patch 即整行」的 INSERT 路径，patch 里没有的列由数据库默认值填成
 * `NULL`，而冷重放比的是**列集**——少写一列，重放侧缺键、业务表侧是 `null`，`field_mismatch`
 * 报的是套件自己的疏忽而不是被测实现的缺陷。
 *
 * `createdAt` / `updatedAt` 写了也会被 {@link excludedColumnsOf} 摘掉，留着是为了让这个函数
 * 交出的东西真的是「整行」，读的人不必回头确认哪几列被省略了。
 */
const noteFields = (title: string, body: string | null): Record<string, unknown> => {
  const now = new Date();
  return { title, body, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null };
};

/**
 * `SwitchVersionActions` 的键
 *
 * @remarks
 * 必须走 {@link getRxDBChangeKey} 而不是手拼 `${namespace}:${entity}:${entityId}`：真正的键第三段是
 * `rxid1:<hex>` 身份键（自带冒号），生产侧三个造 actions 的地方都是它拼的。手写裸 id 的键会让
 * 「按冒号切第三片」这种解析**恰好答对**，于是六个后端全绿、真跑起来捕获到的 `entityId` 却是
 * 字面量 `'rxid1'`——套件的键形态与生产分叉时，被掩盖的正是它要证的那条命题。
 */
const actionKeyOf = (EntityClass: EntityType, entityId: string): string => {
  const metadata = getEntityMetadata(EntityClass);
  return getRxDBChangeKey({ namespace: metadata.namespace, entity: metadata.name, entityId } as IRxDBChange);
};

/** 三个桶都空的 actions；三个具体构造器各自往里放一条。 */
const emptyActions = (): SwitchVersionActions => ({ deletes: new Map(), updates: new Map(), inserts: new Map() });

/** 单条 INSERT 的 actions。 */
const insertActions = (
  EntityClass: EntityType,
  entityId: string,
  patch: Record<string, unknown>
): SwitchVersionActions => {
  const actions = emptyActions();
  actions.inserts.set(actionKeyOf(EntityClass, entityId), { patch, inversePatch: null });
  return actions;
};

/** 单条 UPDATE 的 actions；`inversePatch` 是 discard 的唯一退路，必须给。 */
const updateActions = (
  EntityClass: EntityType,
  entityId: string,
  patch: Record<string, unknown>,
  inversePatch: Record<string, unknown>
): SwitchVersionActions => {
  const actions = emptyActions();
  actions.updates.set(actionKeyOf(EntityClass, entityId), { patch, inversePatch });
  return actions;
};

/** 单条 DELETE 的 actions；DELETE 单元不带 patch，恢复数据只在 `inversePatch` 里。 */
const deleteActions = (
  EntityClass: EntityType,
  entityId: string,
  inversePatch: Record<string, unknown>
): SwitchVersionActions => {
  const actions = emptyActions();
  actions.deletes.set(actionKeyOf(EntityClass, entityId), { patch: null, inversePatch });
  return actions;
};

/** 一行 HEAD 投影；构造器与 {@link insertActions} 共用同一份 patch，两侧不会分叉。 */
const headRowOf = (EntityClass: EntityType, entityId: string, fields: Record<string, unknown>): ColdReplayRow => {
  const metadata = getEntityMetadata(EntityClass);
  return { namespace: metadata.namespace, entity: metadata.name, entityId, fields };
};

/**
 * 本套件要冒充的登记表行，三段身份按 `文件·符号·意图` 原样抄
 *
 * @remarks
 * 不是整表：#8 `pullSingleRepository` 用不上；#10 接管屏障也不抄——接管用例走的是真实的
 * `switchBranch()`，那一行由生产代码自己声明。
 */
const CALLSITE = {
  branch_materialization: {
    file: 'VersionManager.ts',
    symbol: 'switchBranch',
    intent: TrustedWriteIntent.branch_materialization
  },
  restore_entity: { file: 'restore-entity.ts', symbol: 'restore_entity', intent: TrustedWriteIntent.restore_entity },
  redo_invalidation: {
    file: 'HistoryManager.ts',
    symbol: 'invalidateRedoStack',
    intent: TrustedWriteIntent.redo_invalidation
  },
  undo_redo: { file: 'undo-redo-apply.ts', symbol: 'applyUndoRedoHistories', intent: TrustedWriteIntent.undo_redo },
  merge_squash: { file: 'merge-branch.ts', symbol: 'merge_branch', intent: TrustedWriteIntent.merge_squash },
  merge_per_change: { file: 'merge-branch.ts', symbol: 'merge_branch', intent: TrustedWriteIntent.merge_per_change },
  pull_batch: { file: 'pull-batch.ts', symbol: 'pullBatchOnce', intent: TrustedWriteIntent.remote_sync },
  cleanup_expired: { file: 'cleanup-expired.ts', symbol: 'cleanupExpired', intent: TrustedWriteIntent.remote_sync }
} as const satisfies Readonly<Record<string, TrustedWriteDeclaration>>;

/**
 * 接管切换那条用例的目标分支
 *
 * @remarks
 * 只有一行远端元数据：没有 ref、没有工作树状态行。只有这种分支会让
 * `VersionManager.switchBranch()` 真的走进接管路径——`classifyBranchMaterialization()`
 * 判出 `metadata_only` 才接管，其余一律照常走普通切换。
 */
const METADATA_ONLY_BRANCH_ID = 'conformance-capture-metadata-only';

/**
 * 注入一条只有元数据的远端分支
 *
 * @param database - 被测库
 * @returns 注入的分支 id
 *
 * @remarks
 * 不能用 `createBranch()`：那条路会连 ref、工作树状态行一起写下，目标于是被判成已物化，
 * 切换照常走普通路径，屏障一行都不会跑。提交侧套件里那一份同理由、同写法。
 */
const injectMetadataOnlyBranch = async (database: RxDB): Promise<string> => {
  await withTransaction(database, async executor => {
    const branch = database.entityManager.instantiate(RxDBBranch);
    branch.id = METADATA_ONLY_BRANCH_ID;
    branch.parentId = null;
    branch.activated = false;
    branch.activeKey = null;
    branch.local = false;
    branch.remote = true;
    branch.fromChangeId = null;
    await executor.saveMany([branch]);
  });
  return METADATA_ONLY_BRANCH_ID;
};

/**
 * 造一个只有一页、`applyPage` 只写一条 {@link ConformanceNote} 的快照来源
 *
 * @param title - `applyPage` 写下那一行的标题；断言靠它认出这一行确实是屏障写的
 * @returns 可直接交给 `registerMaterializationSource()` 的来源
 *
 * @remarks
 * `applyPage` 用屏障交下来的 executor 上的 Repository 写——普通 CRUD 的写法，是故意的：挂载点 1
 * 在事务体返回之后按「有没有声明」定入口，没有声明就按 `crud` 捕获。屏障里的投影重写若被这样
 * 捕获，症状就是「切了个分支，工作树里多出一条用户没做过的编辑」。
 *
 * 页 payload 不参与 `applyPage`：本节只问屏障里的写会不会被当成用户编辑，
 * 不问来源怎么把 payload 翻成行——那是同步层（US-308）的事。
 */
const singleNoteMaterializationSource = (title: string): BranchMaterializationSource => {
  const entity = getEntityMetadata(ConformanceNote).name;
  return {
    freezeIntent: async () => ({ frozenRemoteWatermark: { changeId: 1 }, syncScope: [entity] }),
    pages: () =>
      (async function* () {
        const payload = { rows: [{ entity, title }] };
        yield { payload, fingerprint: branchMaterializationPageFingerprint(payload) };
      })(),
    applyPage: async ({ executor }) => {
      await executor.getRepository(ConformanceNote).create(noteOf(title, null));
    }
  };
};

/**
 * 一张表在系统表判定里的身份键
 *
 * @param EntityClass - 实体类
 * @returns `namespace:name`
 *
 * @remarks
 * 与 `isSystemEntity()` 内部用的键同形。按类引用比对读起来更直接，却测不到「同名不同类」——
 * 而那恰好是「实体清单被抄了第二份」的症状。
 */
const identityOf = (EntityClass: EntityType): string => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return `${namespace}:${name}`;
};

/** epic-006 之前就有的 4 张系统表；只用来给 §1.5 的双向相等留出差集。 */
const PRE_EPIC_006_SYSTEM_ENTITIES: readonly EntityType[] = [RxDBBranch, RxDBChange, RxDBMigration, RxDBSync];

/**
 * epic-006 新增的 10 张系统表
 *
 * @remarks
 * 顺序照 `data-model.md` §1 的 1→10 抄，与 {@link SYSTEM_ENTITIES} 里那一段一致。
 *
 * **这份清单是故意手写的**，不从 `SYSTEM_ENTITIES` 里算差集：算出来的话，新增一张系统表会被
 * 自动收编进来，而 §1.5 的三条断言（登记、`log === false`、不引用 `rxdb_change`）恰恰是
 * 「新表必须逐条过一遍」的那个门。手写清单让新表先在这里编译失败，这是绊线不是重复。
 */
const EPIC_006_SYSTEM_ENTITIES: readonly EntityType[] = [
  CommitCapabilityState,
  WorkingTreeActivationState,
  Commit,
  CommitChangeSet,
  CommitBranchRef,
  WorkingTreeState,
  WorkingTreeEntry,
  WorkingTreeRestoreSession,
  WorkingTreeMaterializationStage,
  WorkingTreeMaterializationPage
];

/**
 * 捕获侧一致性套件
 *
 * @param context - 后端接入点，见 {@link WorkingTreeConformanceSuiteContext}
 * @returns 无；直接向当前 `describe` 作用域注册用例
 */
export const workingTreeCaptureConformanceSuite = (context: WorkingTreeConformanceSuiteContext): void => {
  describe(`[${context.name}] 工作树捕获一致性`, () => {
    let database: RxDB;

    beforeEach(async () => {
      database = await context.createDatabase();
      // 审计主体必须非空，见 WORKING_TREE_CONFORMANCE_USER_ID：适配器用它覆写 createdBy /
      // updatedBy，而这两列是 tracked 的。userId 为空时两列恒为 null，冷重放两侧同时是 null，
      // 「适配器盖上去的列有没有被捕获」这一整类缺陷会全程假绿——绊线放在建库处，
      // 让漏配的调用点在第一条用例上就红，而不是让它安静地少测一整类。
      expect(database.context.userId, '调用点没有配置 context.userId').toBeTruthy();
    });

    /** 在当前分支上物化一行业务数据：`projection_rewrite`，按契约不产生单元。 */
    const materializeNote = async (entityId: string, fields: Record<string, unknown>): Promise<ColdReplayRow> => {
      const adapter = await localAdapterOf(database);
      const branchId = await withTransaction(database, readActiveBranchId);
      declareTrustedWrite(adapter, CALLSITE.branch_materialization);
      await adapter.switchBranch({
        branchId,
        actions: insertActions(ConformanceNote, entityId, fields),
        // `branchId` 取自 `readActiveBranchId()`，分支不换，没有前置条件可校验。
        prepare: SKIP_BRANCH_SWITCH_PREPARE
      });
      return headRowOf(ConformanceNote, entityId, fields);
    };

    describe('§1.1 捕获完备性 —— transaction 挂载点', () => {
      it('普通 CRUD 落 origin=local 的单元，冷重放与业务表逐字段相等', async () => {
        const before = await withTransaction(database, readWorkingTreeState);
        expect(before.entryCount, '全新库的工作树不是空的').toBe(0);

        await withTransaction(database, executor => executor.getRepository(ConformanceNote).create(noteOf('甲', null)));

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['local']);
        expect(entries.map(entry => entry.operation)).toEqual(['insert']);
        await expectColdReplayIntact(database);
      });

      it('显式事务里的多次写入共享同一 unitId，冷重放与业务表逐字段相等', async () => {
        await withTransaction(database, async executor => {
          const repository = executor.getRepository(ConformanceNote);
          await repository.create(noteOf('乙', '正文'));
          await repository.create(noteOf('丙', null));
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries).toHaveLength(2);
        expect(new Set(entries.map(entry => entry.unitId)).size, '同一事务的两次写入没有共享 unitId').toBe(1);
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.1 捕获完备性 —— 本地 mergeChanges 挂载点', () => {
      it('restore 落 origin=local 的单元，冷重放与业务表逐字段相等', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const fields = noteFields('恢复出来的', null);
        declareTrustedWrite(adapter, CALLSITE.restore_entity);
        await adapter.mergeChanges(insertActions(ConformanceNote, noteId, fields), undefined, false);

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['local']);
        expect(entries.map(entry => entry.operation)).toEqual(['insert']);
        await expectColdReplayIntact(database);
      });

      it('merge 落 origin=local 的单元，冷重放与业务表逐字段相等', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const fields = noteFields('合并进来的', '正文');
        declareTrustedWrite(adapter, CALLSITE.merge_squash);
        await adapter.mergeChanges(insertActions(ConformanceNote, noteId, fields), undefined, false);

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['local']);
        await expectColdReplayIntact(database);
      });

      it('同步应用落 origin=remote_sync 的单元，冷重放与业务表逐字段相等', async () => {
        const noteId = newEntityId();
        const fields = noteFields('远端来的', null);
        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.pull_batch);
          // disableTriggers=true 是 FR-046 的正路：同步应用不写变更日志，单元仍然要落下来。
          await executor.mergeChanges(insertActions(ConformanceNote, noteId, fields), undefined, true);
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['remote_sync']);
        expect(entries.map(entry => entry.operation)).toEqual(['insert']);
        await expectColdReplayIntact(database);
      });

      it('未声明受信意图的 mergeChanges 被拒，业务表零变化', async () => {
        const adapter = await localAdapterOf(database);
        await expect(
          adapter.mergeChanges(insertActions(ConformanceNote, newEntityId(), noteFields('不该落地', null)))
        ).rejects.toThrow(WorkingTreeWriteRejectedError);

        const entries = await withTransaction(database, readEntries);
        expect(entries, '被拒的合并仍然落了单元').toHaveLength(0);
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.1 捕获完备性 —— switchBranch 挂载点', () => {
      it('分支物化不产生单元，冷重放以物化结果为 HEAD 成立', async () => {
        const head = await materializeNote(newEntityId(), noteFields('物化出来的', null));

        const entries = await withTransaction(database, readEntries);
        expect(entries, '投影重写被二次记录成了工作树单元').toHaveLength(0);
        const state = await withTransaction(database, readWorkingTreeState);
        expect(state.entryCount, '投影重写改了 entryCount').toBe(0);
        await expectColdReplayIntact(database, [head]);
      });

      it('切到 metadata-only 分支时屏障里的物化不产生单元：走真实 switchBranch，切完每条分支 entryCount 仍为 0', async () => {
        // 上一条用例直接调 `adapter.switchBranch()`，证的是 #1 那一行；接管路径不经过它——
        // 屏障写投影用的是自己开的 `adapter.transaction()`，只有从 VersionManager 走进去才测得到。
        const targetBranchId = await injectMetadataOnlyBranch(database);
        const title = '屏障物化写下的';
        database.workingTree.registerMaterializationSource(singleNoteMaterializationSource(title));

        await database.versionManager.switchBranch(targetBranchId);

        expect(await withTransaction(database, readActiveBranchId), '接管路径没有把 active 切过去').toBe(
          targetBranchId
        );
        const titles = await withTransaction(database, executor =>
          readColumnValues(executor, ConformanceNote, 'title')
        );
        // 这一条是下面两条的前提：applyPage 一行都没写的话，「零单元」是空转出来的。
        expect(titles, 'applyPage 没有经屏障事务写下业务行').toEqual([title]);
        const entries = await withTransaction(database, readAllEntries);
        expect(entries, '屏障里的投影重写被记成了工作树单元').toHaveLength(0);
        const counts = await withTransaction(database, async executor => {
          const states = await executor
            .getRepository(WorkingTreeState)
            .find({ where: { combinator: 'and', rules: [] } });
          return states.map(({ branchId, entryCount }) => ({ branchId, entryCount }));
        });
        expect(
          counts.filter(({ entryCount }) => entryCount !== 0),
          '屏障里的投影重写改了 entryCount'
        ).toEqual([]);
      });

      it('redo 失效不产生单元，冷重放以物化结果为 HEAD 成立', async () => {
        const adapter = await localAdapterOf(database);
        const branchId = await withTransaction(database, readActiveBranchId);
        const noteId = newEntityId();
        const fields = noteFields('redo 失效写下的', null);
        declareTrustedWrite(adapter, CALLSITE.redo_invalidation);
        await adapter.switchBranch({
          branchId,
          actions: insertActions(ConformanceNote, noteId, fields),
          prepare: SKIP_BRANCH_SWITCH_PREPARE
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries, 'redo 失效被记成了工作树单元').toHaveLength(0);
        await expectColdReplayIntact(database, [headRowOf(ConformanceNote, noteId, fields)]);
      });

      it('undo/redo 产生 origin=local 的单元，冷重放与业务表逐字段相等', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const head = await materializeNote(noteId, noteFields('原值', null));
        const branchId = await withTransaction(database, readActiveBranchId);

        declareTrustedWrite(adapter, CALLSITE.undo_redo);
        await adapter.switchBranch({
          branchId,
          actions: updateActions(ConformanceNote, noteId, { title: '撤销后' }, { title: '原值' }),
          prepare: SKIP_BRANCH_SWITCH_PREPARE
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['local']);
        expect(entries.map(entry => entry.operation)).toEqual(['update']);
        await expectColdReplayIntact(database, [head]);
      });

      it('未声明受信意图的 switchBranch 被拒，业务表零变化', async () => {
        const adapter = await localAdapterOf(database);
        const branchId = await withTransaction(database, readActiveBranchId);
        await expect(
          adapter.switchBranch({
            branchId,
            actions: insertActions(ConformanceNote, newEntityId(), noteFields('不该落地', null)),
            prepare: SKIP_BRANCH_SWITCH_PREPARE
          })
        ).rejects.toThrow(WorkingTreeWriteRejectedError);

        await withTransaction(database, async executor => {
          const rows = await executor.query(`SELECT * FROM ${executor.tableRef(ConformanceNote)}`);
          expect(rows.rows, '拒绝发生在语句执行之后，业务表被改了').toHaveLength(0);
        });
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.1 捕获完备性 —— upsertMany / deleteByIds 挂载点', () => {
      it('版本化实体的 upsertMany 在返回 Observable 之前同步拒绝', async () => {
        const adapter = await localAdapterOf(database);
        expect(() => adapter.upsertMany('ConformanceNote', [{ id: newEntityId(), title: '批量' }])).toThrow(
          WorkingTreeWriteRejectedError
        );

        await expectColdReplayIntact(database);
      });

      it('版本化实体的 deleteByIds 在返回 Observable 之前同步拒绝', async () => {
        const adapter = await localAdapterOf(database);
        expect(() => adapter.deleteByIds('ConformanceNote', [newEntityId()])).toThrow(WorkingTreeWriteRejectedError);

        await expectColdReplayIntact(database);
      });

      it('QueryCache 实体的 upsertMany / deleteByIds 照常放行，且不进工作树', async () => {
        const adapter = await localAdapterOf(database);
        const cacheId = newEntityId();
        const now = new Date().toISOString();
        await firstValueFrom(
          adapter.upsertMany('ConformanceCache', [{ id: cacheId, label: '缓存', createdAt: now, updatedAt: now }])
        );

        const afterUpsert = await withTransaction(database, async executor => {
          const rows = await executor.query(`SELECT * FROM ${executor.tableRef(ConformanceCache)}`);
          return rows.rows.length;
        });
        expect(afterUpsert, 'QueryCache 的 upsertMany 被门禁拦掉了').toBe(1);
        expect(await withTransaction(database, readEntries), 'QueryCache 写进了工作树').toHaveLength(0);

        await firstValueFrom(adapter.deleteByIds('ConformanceCache', [cacheId]));
        expect(await withTransaction(database, readEntries), 'QueryCache 删除写进了工作树').toHaveLength(0);
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.2 写入口语义矩阵', () => {
      it('行 1 crud：落 origin=local 的单元，修订号前进、entryCount 跟上', async () => {
        const before = await withTransaction(database, readWorkingTreeState);
        await withTransaction(database, executor =>
          executor.getRepository(ConformanceNote).create(noteOf('行 1 写的', null))
        );

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['local']);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.entryCount, 'crud 落了单元，entryCount 没跟上').toBe(1);
        expect(after.workingTreeRevision, 'crud 落了单元，修订号没前进').toBeGreaterThan(before.workingTreeRevision);
        await expectColdReplayIntact(database);
      });

      it('行 2 domain_recompute：两次独立重算各落一个 origin=local 的单元', async () => {
        const adapter = await localAdapterOf(database);
        declareTrustedWrite(adapter, CALLSITE.restore_entity);
        await adapter.mergeChanges(
          insertActions(ConformanceNote, newEntityId(), noteFields('恢复重算的', null)),
          undefined,
          false
        );
        declareTrustedWrite(adapter, CALLSITE.merge_squash);
        await adapter.mergeChanges(
          insertActions(ConformanceNote, newEntityId(), noteFields('合并重算的', '正文')),
          undefined,
          false
        );

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['local', 'local']);
        // 两次调用是两个写原语，不是一个事务里的两次写：折进同一个 unitId 的话，discard 只能
        // 把它们一起丢掉，而它们本来可以分别丢。
        expect(new Set(entries.map(entry => entry.unitId)).size, '两次独立重算共享了 unitId').toBe(2);
        const state = await withTransaction(database, readWorkingTreeState);
        expect(state.entryCount).toBe(2);
        await expectColdReplayIntact(database);
      });

      it('行 3 remote_entity_apply：落 origin=remote_sync 的单元，且不写变更日志', async () => {
        const noteId = newEntityId();
        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.pull_batch);
          await executor.mergeChanges(
            insertActions(ConformanceNote, noteId, noteFields('远端插入的', null)),
            undefined,
            true
          );
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['remote_sync']);
        const changes = await withTransaction(database, executor =>
          executor.getRepository(RxDBChange).find({ where: { combinator: 'and', rules: [] } })
        );
        expect(
          changes.filter(change => change.entity === getEntityMetadata(ConformanceNote).name),
          '同步应用写了变更日志：这一行会被当成本地编辑再 push 回远端（FR-046 的 push echo）'
        ).toHaveLength(0);
        await expectColdReplayIntact(database);
      });

      it('行 4 只写簿记列的同步应用：不产生单元，修订号一步不动', async () => {
        const noteId = newEntityId();
        const fields = noteFields('簿记原值', null);
        const head = await materializeNote(noteId, fields);
        const before = await withTransaction(database, readWorkingTreeState);

        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.pull_batch);
          await executor.mergeChanges(
            updateActions(ConformanceNote, noteId, { updatedAt: new Date() }, { updatedAt: fields['updatedAt'] }),
            undefined,
            true
          );
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries, '列集 ⊆ untracked 字段域的更新落了单元').toHaveLength(0);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.workingTreeRevision, '无净变化的写推进了修订号').toBe(before.workingTreeRevision);
        expect(after.entryCount).toBe(before.entryCount);
        await expectColdReplayIntact(database, [head]);
      });

      it('行 5 cleanup_expired：落 origin=remote_sync 的删除单元，修订号前进', async () => {
        const noteId = newEntityId();
        const fields = noteFields('等着被清理的', null);
        const head = await materializeNote(noteId, fields);
        const before = await withTransaction(database, readWorkingTreeState);

        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.cleanup_expired);
          await executor.mergeChanges(deleteActions(ConformanceNote, noteId, fields), undefined, true);
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries.map(entry => entry.origin)).toEqual(['remote_sync']);
        expect(entries.map(entry => entry.operation)).toEqual(['delete']);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.workingTreeRevision, '过期清理没有推进修订号').toBeGreaterThan(before.workingTreeRevision);
        // HEAD 上有这一行、工作树里是一个 delete 单元，净状态因此是「这一行没了」。
        await expectColdReplayIntact(database, [head]);
      });

      it('行 6 projection_rewrite：投影重写不产生单元，修订号一步不动', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const fields = noteFields('投影原值', null);
        await materializeNote(noteId, fields);
        const before = await withTransaction(database, readWorkingTreeState);
        const branchId = await withTransaction(database, readActiveBranchId);

        declareTrustedWrite(adapter, CALLSITE.branch_materialization);
        await adapter.switchBranch({
          branchId,
          actions: updateActions(ConformanceNote, noteId, { title: '投影重写后' }, { title: '投影原值' }),
          prepare: SKIP_BRANCH_SWITCH_PREPARE
        });

        const entries = await withTransaction(database, readEntries);
        expect(entries, '投影重写被二次记录成了工作树单元').toHaveLength(0);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.workingTreeRevision, '投影重写推进了修订号').toBe(before.workingTreeRevision);
        await expectColdReplayIntact(database, [
          headRowOf(ConformanceNote, noteId, { ...fields, title: '投影重写后' })
        ]);
      });

      it('行 7 metadata_only_prefetch：矩阵对版本化目标判拒绝', async () => {
        // **这一行只能断到判定为止。** 它的正路是「预取只写暂存表与独立水位，碰不到业务表」，
        // 而暂存表与独立水位来自 US-308（T115 / T122），到 T067 为止还没有实现，因此没有任何
        // 调用方能在这里发出一次真实的 metadata_only_prefetch 写。端到端那一半留给 US-308。
        // 现在能钉住的是矩阵本身：真发到版本化业务表上时它必须拒绝，而不是悄悄放行。
        const decision = classifyWriteEntrance({
          entrance: 'metadata_only_prefetch',
          targetClass: 'versioned',
          operation: 'update',
          columns: { kind: 'whole_row' },
          untrackedFields: [],
          capabilityEnabled: true
        });
        expect(decision.kind).toBe('reject');
        await expectColdReplayIntact(database);
      });

      it('行 8 query_cache_maintenance：缓存表照常读写，工作树一个字不动', async () => {
        const adapter = await localAdapterOf(database);
        const before = await withTransaction(database, readWorkingTreeState);
        const cacheId = newEntityId();
        const now = new Date().toISOString();
        await firstValueFrom(
          adapter.upsertMany('ConformanceCache', [{ id: cacheId, label: '维护写的', createdAt: now, updatedAt: now }])
        );
        await firstValueFrom(adapter.deleteByIds('ConformanceCache', [cacheId]));

        expect(await withTransaction(database, readEntries), '缓存维护写进了工作树').toHaveLength(0);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.entryCount).toBe(before.entryCount);
        expect(after.workingTreeRevision, '缓存维护推进了修订号').toBe(before.workingTreeRevision);
        await expectColdReplayIntact(database);
      });

      it('行 9 raw_write：在语句执行之前拒绝，业务表零变化', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const fields = noteFields('raw 之前的值', null);
        const head = await materializeNote(noteId, fields);
        const sql = await withTransaction(
          database,
          async executor => `UPDATE ${executor.tableRef(ConformanceNote)} SET title = 'raw 改的'`
        );

        let executed = 0;
        const rejection = await expectWriteRejected(() =>
          gateRawWrite(sql, adapter.workingTreeRawWriteContext, () => {
            executed += 1;
          })
        );
        expect(rejection.entrance).toBe('raw_write');
        expect(rejection.code).toBe(CommitErrorCode.commit_capability_mismatch);
        expect(executed, '拒绝发生在语句执行之后，不是执行之前').toBe(0);
        await expectColdReplayIntact(database, [head]);
      });

      it('行 10 bulk_write：裸批量写版本化实体被拒，带矩阵的稳定错误码', async () => {
        const adapter = await localAdapterOf(database);
        const rejection = await expectWriteRejected(() =>
          adapter.upsertMany('ConformanceNote', [{ id: newEntityId(), title: '批量塞进来的' }])
        );
        expect(rejection.entrance).toBe('bulk_write');
        expect(rejection.code).toBe(CommitErrorCode.commit_capability_mismatch);
        expect(rejection.entityName).toBe(getEntityMetadata(ConformanceNote).name);
        await expectColdReplayIntact(database);
      });

      it('行 11 notify_external_update：版本化实体无条件拒绝，QueryCache 实体照常放行', async () => {
        const rejection = await expectWriteRejected(() =>
          database.entityManager.notifyExternalUpdate(ConformanceNote, newEntityId(), { title: '库外改的' })
        );
        expect(rejection.entrance).toBe('notify_external_update');
        expect(rejection.code).toBe(CommitErrorCode.commit_capability_mismatch);
        expect(() =>
          database.entityManager.notifyExternalUpdate(ConformanceCache, newEntityId(), { label: '库外改的缓存' })
        ).not.toThrow();
        await expectColdReplayIntact(database);
      });

      it('未登记的入口默认拒绝：版本化目标上的放行集恰好是矩阵写明的那 5 行', async () => {
        const adapter = await localAdapterOf(database);
        // untracked 字段域从生产域现问：套件自己编一份的话，这条断言验的是套件而不是矩阵。
        const untrackedFields = [...domainOf(adapter).untrackedFieldsOf(getEntityMetadata(ConformanceNote).tableName)];
        const rejected = WRITE_ENTRANCES.filter(
          entrance =>
            classifyWriteEntrance({
              entrance,
              targetClass: 'versioned',
              operation: 'insert',
              columns: { kind: 'whole_row' },
              untrackedFields,
              capabilityEnabled: true
            }).kind === 'reject'
        );

        expect(new Set(rejected)).toEqual(
          new Set<WriteEntrance>([
            'metadata_only_prefetch',
            'query_cache_maintenance',
            'raw_write',
            'bulk_write',
            'notify_external_update',
            'unknown'
          ])
        );
        // 单独点名：fail-closed 的整条防线就压在这一个取值上。
        expect(rejected, '未登记的调用方没有落进默认拒绝').toContain('unknown');
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.3 raw 通道 bypass 四步判定', () => {
      /** 一条打在版本化业务表 tracked 列上的 raw 写；第 1 / 3 步共用它，只换上下文。 */
      const trackedRawWrite = (): Promise<string> =>
        withTransaction(
          database,
          async executor => `UPDATE ${executor.tableRef(ConformanceNote)} SET title = '几步都用它'`
        );

      it('第 1 步 提交能力未启用：原样放行，零行为差异', async () => {
        const adapter = await localAdapterOf(database);
        const sql = await trackedRawWrite();

        // 能力位关掉的上下文只能现造：适配器在未启用时交出的那一份（核心的 `RawWriteContext`）
        // 在类型上就没有 `domain`，判定要的那份输入根本拼不出来——这正是接缝的意图。
        expect(judgeRawWrite(sql, { capabilityEnabled: false, domain: domainOf(adapter) })).toEqual({
          kind: 'allow',
          step: 1,
          reason: 'capability_disabled'
        });
        await expectColdReplayIntact(database);
      });

      it('第 2 步 不是写语句：放行', async () => {
        const adapter = await localAdapterOf(database);
        const sql = await withTransaction(
          database,
          async executor => `SELECT * FROM ${executor.tableRef(ConformanceNote)}`
        );

        expect(judgeRawWrite(sql, judgmentContextOf(adapter))).toEqual({
          kind: 'allow',
          step: 2,
          reason: 'not_a_write'
        });
        await expectColdReplayIntact(database);
      });

      it('第 3 步 打在 tracked 列上：语句执行之前被拒，业务表零变化', async () => {
        const adapter = await localAdapterOf(database);
        const domain = domainOf(adapter);
        const noteId = newEntityId();
        const fields = noteFields('第 3 步之前的值', null);
        const head = await materializeNote(noteId, fields);
        const sql = await trackedRawWrite();

        const judgment = judgeRawWrite(sql, judgmentContextOf(adapter));
        if (judgment.kind !== 'reject') {
          throw new Error(`第 3 步没有拒绝：落在第 ${judgment.step} 步（${judgment.reason}）`);
        }
        expect(judgment.step).toBe(3);
        expect(judgment.code).toBe(CommitErrorCode.commit_capability_mismatch);
        // 被点名的表名按后端归一（PGlite 的 `conformance_notes` 与 SQLite 家族的
        // `public$conformance_notes`），两种形态都在域里登记过，所以断言只问「在不在域里」。
        expect(judgment.tables.length, '拒绝没有点名被命中的版本化表').toBeGreaterThan(0);
        expect(
          judgment.tables.filter(table => !domain.versionedTables.has(table)),
          '拒绝点名了一张不在版本化域里的表'
        ).toEqual([]);

        let executed = 0;
        await expectWriteRejected(() =>
          gateRawWrite(sql, adapter.workingTreeRawWriteContext, () => {
            executed += 1;
          })
        );
        // 「执行前拒绝」与「写完回滚」在事务里看起来一模一样；分开它们的是这两条断言：
        // 执行器一次都没被调用，且那一列还是原值。
        expect(executed, '语句被下发了：这是写完回滚，不是执行前拒绝').toBe(0);
        const titles = await withTransaction(database, executor =>
          readColumnValues(executor, ConformanceNote, 'title')
        );
        expect(titles, '业务表变了：raw 写穿过了门禁').toEqual([fields['title']]);
        await expectColdReplayIntact(database, [head]);
      });

      it('第 3 步 语句批里的第二条也要拦住整批', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const fields = noteFields('语句批之前的值', null);
        const head = await materializeNote(noteId, fields);
        // 只判第一条的话，前面垫一条无害语句就是最省事的一种绕过。
        const sql = await withTransaction(
          database,
          async executor => `SELECT 1; UPDATE ${executor.tableRef(ConformanceNote)} SET title = '批里第二条改的'`
        );

        let executed = 0;
        const rejection = await expectWriteRejected(() =>
          gateRawWrite(sql, adapter.workingTreeRawWriteContext, () => {
            executed += 1;
          })
        );
        expect(rejection.entrance).toBe('raw_write');
        expect(executed, '整批被下发了：判定只看了第一条语句').toBe(0);
        const titles = await withTransaction(database, executor =>
          readColumnValues(executor, ConformanceNote, 'title')
        );
        expect(titles, '业务表变了：语句批绕过了门禁').toEqual([fields['title']]);
        await expectColdReplayIntact(database, [head]);
      });

      it('第 3 步 列集解析不出：fail-closed，同样在执行前拒绝', async () => {
        const adapter = await localAdapterOf(database);
        const noteId = newEntityId();
        const fields = noteFields('解析不出之前的值', null);
        const head = await materializeNote(noteId, fields);
        // `SET (a, b) = (SELECT …)` 是合法 SQL，但判定拆不出被写列集。拆不出时必须按
        // 「可能写了 tracked 列」处理——按「没写 tracked 列」放行会把绕过捕获变成一道语法题。
        const sql = await withTransaction(
          database,
          async executor =>
            `UPDATE ${executor.tableRef(ConformanceNote)} SET ("title", "body") = (SELECT '解析不出改的', NULL)`
        );

        let executed = 0;
        const rejection = await expectWriteRejected(() =>
          gateRawWrite(sql, adapter.workingTreeRawWriteContext, () => {
            executed += 1;
          })
        );
        expect(rejection.entrance).toBe('raw_write');
        expect(rejection.code).toBe(CommitErrorCode.commit_capability_mismatch);
        // 这条语句的语法未必被每个后端接受，但那无关紧要：它一次都没到过数据库。
        expect(executed, '列集解析不出的语句被下发了').toBe(0);
        const titles = await withTransaction(database, executor =>
          readColumnValues(executor, ConformanceNote, 'title')
        );
        expect(titles, '业务表变了：fail-closed 没有生效').toEqual([fields['title']]);
        await expectColdReplayIntact(database, [head]);
      });

      it('第 3 步 dollar-quote 字面量里的假 WHERE：拦在执行之前，不被当成子句', async () => {
        const adapter = await localAdapterOf(database);
        const domain = domainOf(adapter);
        const noteId = newEntityId();
        const fields = noteFields('dollar-quote 之前的值', null);
        const head = await materializeNote(noteId, fields);
        // PG 的 `$$…$$` 是第五类定界符。不认它的话，字面量里的 `WHERE` 会被当成真子句，
        // 后面的 `title` 就被切进「条件」里丢掉，判定只看见簿记列 `updatedAt`——
        // 于是这条改 tracked 列的语句在第 4 步以 untracked_only 放行，捕获被整条绕过。
        const sql = await withTransaction(
          database,
          async executor =>
            `UPDATE ${executor.tableRef(ConformanceNote)} SET "updatedAt" = $$ WHERE $$, title = 'dollar-quote 改的'`
        );

        const judgment = judgeRawWrite(sql, judgmentContextOf(adapter));
        if (judgment.kind !== 'reject') {
          throw new Error(`dollar-quote 绕过没被拦住：落在第 ${judgment.step} 步（${judgment.reason}）`);
        }
        expect(judgment.step).toBe(3);
        expect(judgment.code).toBe(CommitErrorCode.commit_capability_mismatch);
        expect(
          judgment.tables.filter(table => !domain.versionedTables.has(table)),
          '拒绝点名了一张不在版本化域里的表'
        ).toEqual([]);

        let executed = 0;
        await expectWriteRejected(() =>
          gateRawWrite(sql, adapter.workingTreeRawWriteContext, () => {
            executed += 1;
          })
        );
        // `$$` 只是 PG 的语法，五个 SQLite 家族后端不认；但这条断言不依赖后端能不能解析它——
        // 判定在执行前就拒了，语句一次都没到过数据库。
        expect(executed, 'dollar-quote 语句被下发了').toBe(0);
        const titles = await withTransaction(database, executor =>
          readColumnValues(executor, ConformanceNote, 'title')
        );
        expect(titles, '业务表变了：dollar-quote 穿过了门禁').toEqual([fields['title']]);
        await expectColdReplayIntact(database, [head]);
      });

      it('第 4 步 只改簿记字段：放行，理由是 untracked_only', async () => {
        const adapter = await localAdapterOf(database);
        // 列名带引号是故意的：判定先压小写、后拆引号，`"updatedAt"` 要能归到域里的 `updatedAt`。
        // 这一步归不到位的话，一次只改审计时间的簿记写会被第 3 步拦成能力不匹配。
        const sql = await withTransaction(
          database,
          async executor => `UPDATE ${executor.tableRef(ConformanceNote)} SET "updatedAt" = '2026-01-01T00:00:00.000Z'`
        );

        expect(judgeRawWrite(sql, judgmentContextOf(adapter))).toEqual({
          kind: 'allow',
          step: 4,
          reason: 'untracked_only'
        });
        await expectColdReplayIntact(database);
      });

      it('第 4 步 写域外目标：放行，理由是 out_of_domain', async () => {
        const adapter = await localAdapterOf(database);
        const domain = domainOf(adapter);
        // 影子表这类域外目标的代表。名字在 `versionedTables` 之外即为域外——判定不按 `$`
        // 之类的分隔符切一刀，否则 `_fts_public$post` 切完正好等于 `post`。
        const outOfDomainTable = '_fts_conformance_notes';
        expect(domain.versionedTables.has(outOfDomainTable), '这张表意外落进了版本化域').toBe(false);

        expect(judgeRawWrite(`UPDATE ${outOfDomainTable} SET title = '域外改的'`, judgmentContextOf(adapter))).toEqual({
          kind: 'allow',
          step: 4,
          reason: 'out_of_domain'
        });
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.4 untracked 域', () => {
      it('第 1 类 untracked —— QueryCache 实体：整体不进版本化域，写它不动工作树', async () => {
        const adapter = await localAdapterOf(database);
        const hook = hookOf(adapter);
        const domain = domainOf(adapter);
        expect(hook.targetClassOf(getEntityMetadata(ConformanceCache).name)).toBe('query_cache');
        expect(hook.targetClassOf(getEntityMetadata(ConformanceNote).name)).toBe('versioned');
        // 表平面必须跟着实体平面走：缓存表不在 `versionedTables` 里，于是一条打在它上面的 raw 写
        // 在第 4 步就以 out_of_domain 放行，根本走不到第 3 步的列级判定。两个平面分叉的话，
        // 同一张缓存表会「实体入口放行、raw 入口拒绝」，而调用方无从知道自己踩的是哪一条。
        expect(domain.versionedTables.has(getEntityMetadata(ConformanceCache).tableName)).toBe(false);
        expect(domain.versionedTables.has(getEntityMetadata(ConformanceNote).tableName)).toBe(true);

        const before = await withTransaction(database, readWorkingTreeState);
        const now = new Date().toISOString();
        await firstValueFrom(
          adapter.upsertMany('ConformanceCache', [
            { id: newEntityId(), label: '缓存行', createdAt: now, updatedAt: now }
          ])
        );

        const after = await withTransaction(database, readWorkingTreeState);
        // 「不进工作树」比「不落单元」强一格：单元数为 0 但修订号动了的话，别的会话会以为
        // 工作树变了并据此作废自己的 CAS——而这次写的内容随时可以从远端重建。
        expect(after.workingTreeRevision, 'QueryCache 的写推进了工作树修订号').toBe(before.workingTreeRevision);
        expect(after.entryCount, 'QueryCache 的写改了 entryCount').toBe(before.entryCount);
        await expectColdReplayIntact(database);
      });

      it('第 2 类 untracked —— 全局簿记字段：每个可寻址表名上都豁免，只动它们不产生单元', async () => {
        const adapter = await localAdapterOf(database);
        const domain = domainOf(adapter);
        // 「全局」是这一类的全部内容：豁免不挑实体、也不挑表名的书写形态。逐个可寻址名字都问一遍
        // 而不是只问逻辑名——漏掉 SQLite 家族的 `public$conformance_notes`，一次只改审计时间的
        // 簿记写会在那 5 个后端上被第 3 步拦成 `commit_capability_mismatch`，而那是在拦错了人。
        for (const table of domain.versionedTables) {
          const untracked = domain.untrackedFieldsOf(table);
          for (const field of UNTRACKED_BOOKKEEPING_FIELDS) {
            expect(untracked.has(field), `${table} 的 untracked 列集里没有全局簿记列 ${field}`).toBe(true);
          }
        }

        const noteId = newEntityId();
        const fields = noteFields('簿记原值', '正文');
        const head = await materializeNote(noteId, fields);
        const before = await withTransaction(database, readWorkingTreeState);
        // 用 `createdAt` 而不是 §1.2 行 4 那条用过的 `updatedAt`：这一类的命题是「整组列都豁免」，
        // 只验一列的话，一份把 `updatedAt` 硬编码进豁免的实现会全绿通过。
        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.pull_batch);
          await executor.mergeChanges(
            updateActions(ConformanceNote, noteId, { createdAt: new Date() }, { createdAt: fields['createdAt'] }),
            undefined,
            true
          );
        });

        expect(await withTransaction(database, readEntries), '列集 ⊆ 全局簿记列的更新落了单元').toHaveLength(0);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.workingTreeRevision, '只动簿记列的写推进了修订号').toBe(before.workingTreeRevision);
        await expectColdReplayIntact(database, [head]);
      });

      it('第 3 类 untracked —— 逐表派生索引列：这个库一列都没登记，豁免集因此恰好等于全局簿记列', async () => {
        const adapter = await localAdapterOf(database);
        const domain = domainOf(adapter);
        const bookkeeping = [...UNTRACKED_BOOKKEEPING_FIELDS].sort();

        // **这一类在 `packages/` 里还没有生产登记点。** `VersionedDomainEntityInput` 上的
        // `derivedIndexColumns` 是留给插件的入口（epic-006「版本化域」第 3 行：列名 MUST 由插件
        // 静态声明并登记），而 `createWorkingTreeCaptureRuntime()` 建域时一个字都不传，全仓唯一
        // 传过它的地方是 `__tests__/working-tree/untracked-domain.spec.ts` 的内存域。
        // 所以这一组只能断言**生产域的形状**：没人登记时豁免集恰好等于全局簿记列，一列不多。
        // 这不是占位——它是个绊线：哪天有人给某张表加了豁免列却没走 §1.4 的契约，这一条会变红。
        for (const table of domain.versionedTables) {
          expect([...domain.untrackedFieldsOf(table)].sort(), `${table} 上多出了没人登记的豁免列`).toEqual(bookkeeping);
        }
        // 豁免按表键控，不是一个全局集合：没登记过的表名问出来也只有全局簿记列，
        // 捡不到别的表的派生列（`isUntrackedField('Comment', 'title_norm') === false` 的表平面对偶）。
        expect(
          [...domain.untrackedFieldsOf('_fts_conformance_notes')].sort(),
          '未登记的表名捡到了别的表的豁免列'
        ).toEqual(bookkeeping);
        await expectColdReplayIntact(database);
      });

      it('清单外的实体默认 tracked —— 第四类 untracked 必须先改 epic-006', async () => {
        const hook = hookOf(await localAdapterOf(database));
        // 三个名字都没在 `rxdb.config.entities` 里登记过。默认值必须是 tracked：漏登记一个实体的
        // 代价因此是「它的写被当成用户编辑」（可发现、可修），而不是「它的写悄悄不进版本控制」
        // （不可发现、数据已经丢了）。命名也不给豁免——带 Cache / Index 的名字照样 versioned，
        // 否则第四类 untracked 就能靠改个名字混进来，而它按契约必须先改 epic-006 的「版本化域」表。
        expect(hook.targetClassOf('NeverRegisteredEntity')).toBe('versioned');
        expect(hook.targetClassOf('NeverRegisteredCache')).toBe('versioned');
        expect(hook.targetClassOf('NeverRegisteredFtsIndex')).toBe('versioned');
        await expectColdReplayIntact(database);
      });

      it('tracked 与 untracked 混进同一事务：报 mixed_versioned_cache_transaction 且整事务回滚', async () => {
        const before = await withTransaction(database, readWorkingTreeState);
        // 走 `EntityManager` 而不是直接调 `isQueryCacheBatch()`：这一条要证伪的形态是「判定函数
        // 是对的，生产入口没接上」，只测纯函数看不见。`ConformanceCache` 仍然没被 `getRepository()`
        // 碰过——`createEntityRef()` 只建实例，仓储是在 `mutations()` 里按批次决定的，而这一批
        // 在选仓储之前就被拒了。
        const note = database.entityManager.createEntityRef(ConformanceNote, {
          id: newEntityId(),
          title: '混用批里的版本化行'
        });
        note.title = '改脏它';
        const cache = database.entityManager.createEntityRef(ConformanceCache, {
          id: newEntityId(),
          label: '混用批里的缓存行'
        });
        cache.label = '改脏它';

        const error = await database.entityManager.saveMany([note, cache]).then(
          () => undefined,
          (thrown: unknown) => thrown
        );
        expect(error, '混用批通过了').toBeInstanceOf(RxDBMixedVersionedCacheTransactionError);
        const mixed = error as RxDBMixedVersionedCacheTransactionError;
        expect(mixed.code).toBe(CommitErrorCode.mixed_versioned_cache_transaction);
        expect(mixed.cacheEntities).toContain(getEntityMetadata(ConformanceCache).name);
        expect(mixed.versionedEntities).toContain(getEntityMetadata(ConformanceNote).name);

        // 整事务回滚：两张业务表都没有行，工作树没有单元，修订号一步不动。只断言「抛了」的话，
        // 一个「先写版本化那半、发现混用再抛」的实现会全绿通过，而它已经把半个事务落了盘。
        await withTransaction(database, async executor => {
          for (const EntityClass of WORKING_TREE_CONFORMANCE_ENTITIES) {
            const rows = await executor.query(`SELECT * FROM ${executor.tableRef(EntityClass)}`);
            expect(rows.rows, `${getEntityMetadata(EntityClass).name} 上留下了半个事务的行`).toHaveLength(0);
          }
        });
        expect(await withTransaction(database, readEntries), '被拒的混用批落了单元').toHaveLength(0);
        const after = await withTransaction(database, readWorkingTreeState);
        expect(after.workingTreeRevision, '被拒的混用批推进了修订号').toBe(before.workingTreeRevision);
        await expectColdReplayIntact(database);
      });

      it("origin='remote_sync' 不是 untracked：同步应用照常产生单元", async () => {
        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.pull_batch);
          await executor.mergeChanges(
            insertActions(ConformanceNote, newEntityId(), noteFields('远端来的', null)),
            undefined,
            true
          );
        });
        await withTransaction(database, executor =>
          executor.getRepository(ConformanceNote).create(noteOf('本地写的', null))
        );

        const entries = await withTransaction(database, readEntries);
        // 两条入口、两个单元：`origin` 只是单元上的一个标注，不是「要不要产生单元」的开关。
        // 把 remote_sync 当成豁免的话，pull 下来的行进不了工作树，而分支切换要靠工作树把它们
        // 还原出来——那时候丢的是远端数据。
        expect(entries.map(entry => entry.origin).sort(), 'remote_sync 被当成了 untracked').toEqual([
          'local',
          'remote_sync'
        ]);
        const noteName = getEntityMetadata(ConformanceNote).name;
        expect(entries.map(entry => entry.entity)).toEqual([noteName, noteName]);
        await expectColdReplayIntact(database);
      });

      it('untracked 判定是静态属性：同一实体不会在一条入口 tracked、另一条 untracked', async () => {
        const adapter = await localAdapterOf(database);
        const hook = hookOf(adapter);
        const noteNamespace = getEntityMetadata(ConformanceNote).namespace;
        const cacheNamespace = getEntityMetadata(ConformanceCache).namespace;
        // 实体平面：带不带命名空间问出来的必须是同一个答案。两条路分叉的话，挂载点 4（只有实体名）
        // 与挂载点 1/2（有命名空间）会对同一个实体给出不同归类。
        expect(hook.targetClassOf('ConformanceNote')).toBe(hook.targetClassOf('ConformanceNote', noteNamespace));
        expect(hook.targetClassOf('ConformanceCache')).toBe(hook.targetClassOf('ConformanceCache', cacheNamespace));

        // 行为平面：untracked 实体走两条入口都不落单元。
        const cacheId = newEntityId();
        const now = new Date().toISOString();
        await firstValueFrom(
          adapter.upsertMany('ConformanceCache', [{ id: cacheId, label: '缓存行', createdAt: now, updatedAt: now }])
        );
        const afterUpsert = (await withTransaction(database, readEntries)).length;
        await firstValueFrom(adapter.deleteByIds('ConformanceCache', [cacheId]));
        const afterDelete = (await withTransaction(database, readEntries)).length;
        expect([afterUpsert, afterDelete], 'QueryCache 实体在某一条入口上被当成了 tracked').toEqual([0, 0]);

        // 行为平面：tracked 实体走两条入口都落单元。
        await withTransaction(database, executor =>
          executor.getRepository(ConformanceNote).create(noteOf('crud 入口', null))
        );
        const afterCrud = (await withTransaction(database, readEntries)).length;
        await withTransaction(database, async executor => {
          declareTrustedWrite(executor, CALLSITE.pull_batch);
          await executor.mergeChanges(
            insertActions(ConformanceNote, newEntityId(), noteFields('同步入口', null)),
            undefined,
            true
          );
        });
        const afterMerge = (await withTransaction(database, readEntries)).length;
        expect([afterCrud, afterMerge], '版本化实体在某一条入口上被当成了 untracked').toEqual([1, 2]);
        await expectColdReplayIntact(database);
      });
    });

    describe('§1.5 存储契约静态断言', () => {
      it('全部 epic-006 系统表都登记在 SYSTEM_ENTITIES 里，且 isSystemEntity() 为真', async () => {
        // 双向相等，不是单向包含：正向漏登记会让库自己的簿记写被当成用户编辑落进工作树，
        // 反向（`SYSTEM_ENTITIES` 里多出一张这里没列的表）说明有人加了系统表却没走 §1.5 的契约。
        // 两边都按 `isSystemEntity()` 用的那把身份键（`namespace:name`）比，而不是按类引用——
        // 判定本身就不是按类引用做的，按类比会让「同名不同类」这种形态漏网。
        expect(SYSTEM_ENTITIES.map(identityOf).sort()).toEqual(
          [...PRE_EPIC_006_SYSTEM_ENTITIES, ...EPIC_006_SYSTEM_ENTITIES].map(identityOf).sort()
        );

        for (const EntityClass of EPIC_006_SYSTEM_ENTITIES) {
          expect(isSystemEntity(EntityClass), `${identityOf(EntityClass)} 没被认成系统表`).toBe(true);
        }
        // 对照组：业务实体不能被认成系统表，否则捕获会把用户编辑整批短路成 `system`。
        for (const EntityClass of WORKING_TREE_CONFORMANCE_ENTITIES) {
          expect(isSystemEntity(EntityClass), `${identityOf(EntityClass)} 被误认成了系统表`).toBe(false);
        }
        await expectColdReplayIntact(database);
      });

      it('全部 epic-006 系统表 log === false：库自己的簿记不进变更日志', async () => {
        for (const EntityClass of EPIC_006_SYSTEM_ENTITIES) {
          expect(getEntityMetadata(EntityClass).log, `${identityOf(EntityClass)} 会往变更日志里写`).toBe(false);
        }
        // `log` 缺省是「记」，所以这里必须逐张断言 `=== false` 而不是 `!== true`：
        // 新表漏写 `log: false` 时元数据上是 `undefined`，宽松判定会把它当成已关掉。
        // 后果是一条工作树簿记写产生一条 `rxdb_change`，那条 change 会被 push 回远端。
        await expectColdReplayIntact(database);
      });

      it('WorkingTreeEntry 与 CommitChangeSet 的 relations 不引用 RxDBChange（静态断言）', async () => {
        const changeEntityName = getEntityMetadata(RxDBChange).name;
        // 契约点名的是这两张表（`rxdb_working_tree_entry` / `rxdb_commit_change_set`）：
        // 它们各自独立完整地复制 patch / inversePatch，不复用也不只引用变更日志行。
        // 引用过去的话，变更日志一旦被裁剪（它按水位清理），工作树与提交历史就会指向不存在的行——
        // 而它们是 discard / restore 的唯一退路。
        expect(getEntityMetadata(WorkingTreeEntry).tableName).toBe('rxdb_working_tree_entry');
        expect(getEntityMetadata(CommitChangeSet).tableName).toBe('rxdb_commit_change_set');

        // 十张一起断言而不是只断言点名的两张：另外八张现在也确实不引用它，把范围收窄到两张
        // 等于给「下一张新表引用 rxdb_change」留门，而那正是这条契约要堵死的形态。
        for (const EntityClass of EPIC_006_SYSTEM_ENTITIES) {
          const mapped = getEntityMetadata(EntityClass).relations.map(relation => relation.mappedEntity);
          expect(mapped, `${identityOf(EntityClass)} 的 relations 引用了 ${changeEntityName}`).not.toContain(
            changeEntityName
          );
        }
        await expectColdReplayIntact(database);
      });
    });
  });
};
