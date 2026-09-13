/**
 * @fileoverview `workingTreeCaptureConformanceSuite` —— 捕获侧一致性套件。
 *
 * @remarks
 * 覆盖范围见 `specs/001-working-tree-commits/contracts/conformance-suites.md` §1：
 * 四个挂载点的捕获完备性、写入口语义矩阵、raw 通道 bypass 五步判定、untracked 域、
 * 存储契约静态断言。
 *
 * **每组末尾都跑冷重放不变量**（§1.1 明文要求）。判据只有这一条：
 * `HEAD 投影 + 全部工作树单元` 重放出来的净状态，必须与业务表实际内容逐字段相等。
 * 计数式断言（「改了 3 行就该有 3 个单元」）两个方向都测不到——折叠规则让计数天然对不上，
 * 而一个漏列的 patch 计数分毫不差。
 *
 * **HEAD 投影恒为空。** 契约 §0 规定工厂每次交还全新实例，本套件里没有任何一条用例调过
 * `commit()`，所以 HEAD 上一行业务数据都没有。`insert` 单元的净状态只来自 patch（不掺 HEAD），
 * 而触发器给出的 INSERT patch 是整行——空 HEAD 上重放因此能还原出完整业务行。
 *
 * **本套件与提交侧套件共用实体清单**（{@link WORKING_TREE_CONFORMANCE_ENTITIES}）。提交侧
 * 只碰系统表，`entities: []` 就够；捕获侧不行——「捕获是否完备」是关于**业务写**的命题。
 *
 * **每条用例一个全新数据库**，理由与提交侧套件相同：契约里没有 teardown 钩子，共享实例会让
 * 上一条用例的残留变成下一条的隐藏前置。
 *
 * @module @aiao/rxdb/testing
 */

import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import { assertColdReplayInvariant, type ColdReplayRow } from '../cold-replay.js';
import { WorkingTreeEntry } from '../working-tree-entry.entity.js';
import { WorkingTreeState } from '../working-tree-state.entity.js';
import { ConformanceNote, WORKING_TREE_CONFORMANCE_ENTITIES } from './conformance-entities.js';
import type { WorkingTreeConformanceSuiteContext } from './suite-context.js';

/** 开一个写事务跑一段命令体，语义与门面 `runEnabled()` 走的是同一条路。 */
const withTransaction = async <T>(database: RxDB, run: (executor: TransactionExecutor) => Promise<T>): Promise<T> => {
  const adapter = await firstValueFrom(database.localAdapter$);
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
 * 两条分支上同一行各有一个单元完全合法，而 {@link replayWorkingTree} 见到同一身份两行会直接
 * 判工作树损坏。业务表里躺着的又只有**当前分支**的投影，跨分支重放本来也对不上。
 */
const readEntries = async (executor: TransactionExecutor): Promise<WorkingTreeEntry[]> => {
  const branchId = await readActiveBranchId(executor);
  const rows = await readAllEntries(executor);
  return rows.filter(row => row.branchId === branchId);
};

/** 读工作树状态行；套件里恒为一行。 */
const readWorkingTreeState = async (executor: TransactionExecutor): Promise<WorkingTreeState> => {
  const rows = await executor.getRepository(WorkingTreeState).find({ where: { combinator: 'and', rules: [] } });
  expect(rows, '工作树状态行不是恰好一行').toHaveLength(1);
  return rows[0];
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

/** 见 {@link normalizeValue}；逐列施加，键集不变。 */
const normalizeFields = (fields: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).map(([column, value]) => [column, normalizeValue(value)]));

/** 单元的 patch 归一；其余列原样——冷重放只读身份三列 + `operation` + `patch`。 */
const normalizeEntry = (entry: WorkingTreeEntry): WorkingTreeEntry => ({
  ...entry,
  patch: entry.patch === null ? null : normalizeFields(entry.patch)
});

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
 * 把一张业务表读成冷重放快照
 *
 * @param executor - 调用方那个事务的执行器
 * @param EntityClass - 业务实体
 * @returns 该表全部行
 *
 * @remarks
 * 走 `SELECT *` 而不是 Repository：Repository 会按实体元数据挑列、还原关系，于是「触发器写了
 * 一个元数据里没有的列」这类缺陷会被它顺手抹平。物理表名由 `executor.tableRef()` 给，六个后端
 * 的命名差异（Postgres 的 `"public"."x"` 与 SQLite 家族的 `"public$x"`）都落在它里面。
 */
const readBusinessRows = async (executor: TransactionExecutor, EntityClass: EntityType): Promise<ColdReplayRow[]> => {
  const metadata = getEntityMetadata(EntityClass);
  const result = await executor.query(`SELECT * FROM ${executor.tableRef(EntityClass)}`);
  const idIndex = result.columns.indexOf(PRIMARY_KEY_COLUMN);
  expect(idIndex, `${metadata.name} 的 SELECT * 里没有 ${PRIMARY_KEY_COLUMN} 列`).toBeGreaterThanOrEqual(0);
  const valued = result.columns
    .map((column, index) => [column, index] as const)
    .filter(([column]) => column !== PRIMARY_KEY_COLUMN);
  return result.rows.map(row => ({
    namespace: metadata.namespace,
    entity: metadata.name,
    entityId: String(row[idIndex]),
    fields: normalizeFields(Object.fromEntries(valued.map(([column, index]) => [column, row[index]])))
  }));
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
 * @returns 无
 * @throws {@link ColdReplayMismatchError} 重放结果与业务表对不上
 */
const expectColdReplayIntact = async (database: RxDB): Promise<void> => {
  await withTransaction(database, async executor => {
    const entries = await readEntries(executor);
    const actual: ColdReplayRow[] = [];
    for (const EntityClass of TRACKED_CONFORMANCE_ENTITIES) {
      actual.push(...(await readBusinessRows(executor, EntityClass)));
    }
    assertColdReplayInvariant({ head: [], entries: entries.map(normalizeEntry), actual });
  });
};

/** 造一条业务实体实例；`id` / 审计列由实体默认值给。 */
const noteOf = (title: string, body: string | null): ConformanceNote => {
  const note = new ConformanceNote();
  note.title = title;
  note.body = body;
  return note;
};

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
    });

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
  });
};
