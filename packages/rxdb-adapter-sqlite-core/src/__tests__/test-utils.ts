import { ENTITY_LOCAL_CREATE_EVENT, type EntityLocalCreatedEvent } from '@aiao/rxdb';
// 只为把 `declare module '@aiao/rxdb'` 的 `versionManager` 声明带进本编译单元：
// 历史 / 撤销重做 / 分支自 US-025 阶段 C 起住在这个插件里，核心 `RxDB` 上没有这个成员。
// 共享套件本身不 `use()` 它 —— 装插件是 `AdapterFactory` 的活（见 `testing.ts` 的契约）。
//
// 写成 `import type {}` 而不是裸的副作用导入：本文件会被 `testing.ts` 的
// `import.meta.glob` 连同各 suite 一起打进 `dist/testing.js`，裸导入就成了该入口
// 的**运行时**依赖。这里要的只有类型声明，`import type` 在 emit 时整句擦除。
import type {} from '@aiao/rxdb-plugin-history';
import { cleanupSqliteTestAdapter, expectObservableSequence } from '@aiao/rxdb-test';
import { expect, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import type { SqliteTransactionExecutor } from '../transaction/SqliteTransactionExecutor.js';
import { generateSwitchBranchSql } from '../version/switch_branch.js';

/**
 * 清理数据库中的所有数据。
 *
 * @remarks
 * 清库动作本身由 `@aiao/rxdb-test` 的 {@link cleanupSqliteTestAdapter} 执行 ——
 * 本文件只负责交出 sqlite-core 特有的那两段方言 SQL。这个分工的判据是**认不认方言**：
 * 「列出 `sqlite_master`、跳过影子表与 `sqlite_*`、逐表 DELETE、补回 main」对任何 SQLite
 * 后端都一样，而触发器怎么拆、分支怎么切是 sqlite-core 自己的表结构决定的。
 *
 * 此前这里是一份平行实现，两边同时维护的代价已经兑现过一次：共享工具按 RXT-005 把影子表
 * 判定收紧成三族精确后缀（FTS5 + FTS3-4 + RTree），本地这份还停在「FTS5 那五个」，于是
 * RTree 的 `_node`/`_rowid`/`_parent` 会被当普通表 DELETE 掉，直接损坏 R 树索引结构。
 *
 * 只清业务表与 `rxdb$` 系统表，**不碰 `sqlite_*` 内部表**。尤其不能重置 `sqlite_sequence`：
 * `rxdb$rxdb_change.id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，产品契约是**单调递增、
 * 删行也不回收 id**，身份缓存（identity map）按 id 认实体正是建立在这条契约上。
 *
 * 重置序列会让每个测试的变更 id 都从 1 重来，于是同一个 id 在一个进程里指代不同的记录：
 * 上一个测试的变更事件是异步投递的，它可能在这里 `cleanAllCache()` 之后才把 `RxDBChange#1`
 * 水合回缓存；下一个测试再查第 1 条变更行时命中的是那个陈旧实体，读出的 `entityId`
 * 属于上一个测试（表现为 `自定义主键列 > 事件：change 表按自定义主键列记录 entityId`
 * 这类按机器负载偶发的假红）。序列不重置后，跨测试的 id 不再重叠，陈旧缓存无从冒充新行。
 */
export const cleanup_db = async (adapter: RxDBAdapterSqliteBase) => {
  await cleanupSqliteTestAdapter(adapter, {
    removeTriggersSql: remove_all_triggers_sql(adapter),
    // main 分支行本身由共享工具按默认 INSERT 补回（那条字面量与本包此前自带的逐字节相同），
    // 这段 switch SQL 负责把触发器按 main 重新装回去。
    resetToMainBranchSql: () => generateSwitchBranchSql(adapter, 'main'),
    // 逐表 DELETE 连工作树/提交侧的单例与 main 的伴生行一起清掉了，这里把它们补回来。
    //
    // 「新库形态」不是本文件定义的，是 `RxDB.createTables()` 定义的：main 分支行**加上**每个
    // 系统能力贡献的初始行。上面那条 INSERT 补的是前半截，这个钩子补后半截——回头调**同一个**
    // `createInitialRows`，于是行的内容始终只有贡献方一个定义处，本文件不必知道有哪些行，
    // 也就不必 import 任何插件包（sqlite-core 连 `@aiao/rxdb-plugin-working-tree` 的
    // devDependency 都没有）。没装插件的库贡献列表为空，一行不写、一次 `saveMany` 都不发。
    //
    // 必须走钩子而不是等 `cleanupSqliteTestAdapter` 返回后再补：那时 `resetToMainBranchSql`
    // 已经把触发器装回去了，补行会被记成一次用户编辑，清理动作自己就在下一个用例的 undo 栈里
    // 留下一格。钩子的调用点卡在 main 分支行之后（那些行按分支挂靠）、触发器重装之前。
    //
    // 形参标注成 `SqliteTransactionExecutor` 是**必要**的：共享工具的事务句柄最小结构里只有
    // `execute`，`saveMany` 归本包的执行器；这条标注同时也是 `TTx` 的推断来源。
    restoreInitialRows: async (tx: SqliteTransactionExecutor) => {
      const initialRows = adapter.rxdb.systemContributions.flatMap(contribution =>
        contribution.createInitialRows(adapter.rxdb.entityManager, { branchIds: ['main'] })
      );
      if (initialRows.length > 0) await tx.saveMany(initialRows);
    }
  });

  // 会话态归 `@aiao/rxdb-plugin-history` 管。这里不做存在性判断：`AdapterFactory` 的契约
  // 要求交出的实例已装该插件，没装就该在这一行炸掉，而不是把一批脏会话态悄悄带进下一条用例。
  adapter.rxdb.versionManager.resetSessionState();
  await Promise.resolve();
  await adapter.query('SELECT 1;');
};

export const expect_observable_sequence = expectObservableSequence;

/**
 * 共享套件里「必须在期限内完成」的挂钟预算，单位毫秒。
 *
 * 这些 suite 会被 `coverage-acceptance` 以 `Promise.all` 并发起五份 chromium 同时跑
 * （见 `scripts/run-coverage-acceptance.mjs`），同一台 runner 上实测把单条用例压慢 3 倍以上。
 * 因此**任何 per-test 上限都不能低于 `vitest.coverage-acceptance.config.mts` 里的
 * `testTimeout: 30000`**——写小了不会让测试更严格，只会在 CI 上假红：
 * 拖过头本来就会被外层 30s 兜住，小上限唯一的作用是提前失败。
 *
 * 显式标注（而不是删掉上限直接继承配置）是必要的：各包 vite.config 的本地默认值只有 5s/10s，
 * 覆盖不掉的话这些偏重的用例在本地会脆。
 *
 * @remarks
 * 只适用于「等某件事发生」的**期限**。用来证明「某件事不发生」的**静默观察窗**
 * （如订阅后等 300ms 断言没有第二次回调）不属于此列，放大它只会拖慢套件而不改变结论。
 */
export const SUITE_DEADLINE_MS = 30_000;

/**
 * 执行一次写入，并等到它引发的变更通知投递、处理完毕后才返回。
 *
 * @remarks
 * `update_hook` 的通知由后端批量投递（debounce + 硬上限），renderer 侧的 `handle_rxdb_change`
 * 又是 fire-and-forget —— 它会自己发 `adapter.query()` 回库补数据。于是「写完立刻给
 * `adapter.query` 装 spy」的断言会把这些后台查询算到被测调用头上，表现为调用次数按机器负载
 * 偶发偏多（`findByRowIds ...` 那几条用例的假红即出自此处）。
 *
 * 判据取「`rxdb$rxdb_change` 那条通知已处理完」：变更行由业务表的 AFTER 触发器写出，
 * 它的通知总排在业务表之后；而适配器查询队列并发度为 1，等到它的终结事件到达时，
 * 业务表那条任务的回库查询早已出队完成。末尾再压一条空查询，走完两条任务尾部剩余的微任务。
 *
 * 计数从 0 起算即可判定「等到的是自己这次写入」——前提是**套件内每次写入都经由本函数**，
 * 否则上一条用例迟到的通知会提前满足这里的条件。
 *
 * @param adapter - 目标适配器
 * @param write - 产生变更的写入操作（单条已登记事务）
 */
export const settle_change_notifications = async (
  adapter: RxDBAdapterSqliteBase,
  write: () => Promise<unknown>
): Promise<void> => {
  let changeTableEvents = 0;
  const listener = (event: EntityLocalCreatedEvent) => {
    if (event.entities.some(entity => entity.namespace === 'rxdb' && entity.entity === 'RxDBChange')) {
      changeTableEvents += 1;
    }
  };
  adapter.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
  try {
    await write();
    await vi.waitFor(() => expect(changeTableEvents).toBeGreaterThan(0), { timeout: SUITE_DEADLINE_MS });
  } finally {
    adapter.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
  }
  await adapter.query('SELECT 1;');
};
