/**
 * @fileoverview 三套 conformance 套件共享的调用上下文。
 *
 * @remarks
 * 契约见 `git show f9528e8f:specs/001-working-tree-commits/contracts/conformance-suites.md` §0：
 * 捕获与提交两套具名套件，调用形状**完全一致**；只读检出位（US-313）的第三套沿用同一个形状。
 * 形状一致不是美学要求——6 个适配器包各自要写三个调用点，形状一旦分叉，写调用点的人就得逐套件回忆参数名，
 * 而回忆错的代价是「套件导出了但没人跑」，那等于没覆盖。各套件对 `createDatabase` 的额外要求
 * （注册哪些实体、插件怎么配）写在各自的文件头里。
 *
 * 类型名用 `WorkingTree*` 前缀而非裸 `SuiteContext`：本文件经 `@aiao/rxdb-plugin-working-tree/testing`
 * 子路径对外导出，受 spec.md 的命名裁决约束（新导出只用 `Commit*` / `WorkingTree*`
 * 前缀）。`*.suite.ts` 被命名门禁排除，本文件不是。
 */

import type { RxDB } from '@aiao/rxdb';

/**
 * 套件调用上下文：一个适配器名 + 一个已就绪数据库的工厂。
 *
 * @remarks
 * `createDatabase` 必须返回**已启用提交能力**的实例（`enable()` 已成功、系统 schema
 * 已迁到 4）。把启用放在工厂里而不是套件里，是因为启用路径本身随适配器不同
 * （内存 / OPFS / node:sqlite host），而套件要断言的是启用**之后**的语义。
 *
 * 每次调用返回**全新**数据库：套件内多条用例共享实例会让「上一条用例的未提交单元」
 * 变成下一条用例的隐藏前置，而这种耦合只在用例顺序变化时才暴露。
 *
 * @public
 */
export interface WorkingTreeConformanceSuiteContext {
  /** 适配器标识，用于 `describe` 标题，让失败输出能直接定位到后端。 */
  readonly name: string;

  /** 返回一个全新的、已启用提交能力的 RxDB 实例。 */
  readonly createDatabase: () => Promise<RxDB>;
}

/**
 * 只读检出位套件（`worktreeConformanceSuite`）的调用上下文：共享形状之上多一个可选工厂。
 *
 * @remarks
 * 必填的仍只有 `name` 与 `createDatabase`，与另外两套同形，不需要它的调用点一个字都不用改。
 *
 * @public
 */
export interface WorktreeConformanceSuiteContext extends WorkingTreeConformanceSuiteContext {
  /**
   * 返回一个快照库落在**持久存储**上的库，只给「持久归属的检出位放开之后原样再打开」（AC10）那条用例用。
   *
   * @remarks
   * 省略即用 `createDatabase`，那时它造的快照库本就要落在持久存储上。给了它，`createDatabase` 的快照库就可以放内存：
   * 官方 sqlite 与 sqliteai 的 OPFS 只能在专用 Worker 里开，每个快照库一个 Worker，整套用例几十个 Worker 建了又收，
   * 本地实测这一组的浏览器内存从约 0.8 GB 涨到约 3.3 GB，覆盖率验收里四组浏览器并发时 sqlite 组偶发挂死。
   * 快照的读写与封印跟存储档位无关，真实存储的删除由各后端自己的 `drop-storage.spec.ts` 对持久存储验。
   */
  readonly createDatabaseWithPersistentSnapshots?: () => Promise<RxDB>;
}
