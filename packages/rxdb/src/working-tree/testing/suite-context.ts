/**
 * @fileoverview 两套 conformance 套件共享的调用上下文。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/contracts/conformance-suites.md` §0：
 * **两套具名套件，没有第三套**，两套的调用形状**完全一致**。形状一致不是美学要求——
 * 6 个适配器包各自要写两个调用点，形状一旦分叉，写调用点的人就得逐套件回忆参数名，
 * 而回忆错的代价是「套件导出了但没人跑」，那等于没覆盖。
 *
 * 类型名用 `WorkingTree*` 前缀而非裸 `SuiteContext`：本文件经 `@aiao/rxdb/testing`
 * 子路径对外导出，受 spec.md 的命名裁决约束（新导出只用 `Commit*` / `WorkingTree*`
 * 前缀）。`*.suite.ts` 被命名门禁排除，本文件不是。
 */

import type { RxDB } from '../../RxDB.js';

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
