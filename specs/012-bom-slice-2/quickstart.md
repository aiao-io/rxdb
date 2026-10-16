# Quickstart: epic-009 首轮切片第 2 步（验证记录）

**日期**：2026-10-14 | **分支**：`claude/bom-related-work-77235b`

## 交付物

| 项                                               | 落点                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-508 视图解析（首轮 AC#1~#11/#13~#15/#17/#18） | `packages/rxdb-plugin-bom/src/resolve/`（`resolution.ts` 类型、`bom-sql.ts` 方言与 SQL、`resolver.ts`、`history-loader.ts`）；追溯发布双后端触发器 + `released_effective_from` 部分唯一索引；`BomHistoryBatch` 实体与 append-only 触发器 |
| US-509 判环（首轮 AC#1~#3/#5~#7/#9~#12/#14/#17） | `backend/bom-trigger-ddl.ts`（双后端递归 CTE 判环触发器）、`resolve/cycle-analysis.ts`（`union_only` 区间分析）、`resolve/cycle-constraint-ddl.ts`（远端 PG DDL 导出）、`plugin.ts`（http/supabase fail-fast + 同步拒绝）                |
| US-510 阶段 A（AC#1/#2/#11 + AC#7/#10 下钻部分） | `resolve/expansion.ts`（BFS 逐层 `expandBom` / `whereUsed`、预算结算、`assertCompleteResolution`）、`bom-sql.ts`（按前沿集合的子件/使用方 SQL）                                                                                          |
| 插件收尾                                         | `plugin.ts` 门面（`resolve` / `loadHistory` / `expandBom` / `whereUsed` / `cycleConstraintDdlForRemotePg`）、错误家族（`BomCycleError` / `BomTruncationError` 等）、`BomLocalAdapter` 最小适配器面、api-baseline 更新                    |

## 测试与门禁（截至当日）

- `rxdb-plugin-bom`:test — 110/110 通过（7 个 spec，wa-sqlite + pglite 双后端）；覆盖率 97.65% 语句 / 90.71% 分支 / 93.12% 函数 / 98.62% 行（四指标 ≥ 80%）
- `rxdb-plugin-bom`:lint / :typecheck — 零警告 / 零错误
- `audit:api-surface` — 51 个公开包基线一致（rxdb-plugin-bom 基线随新导出更新）
- affected full（272 任务）— **272/272 全绿**（两次门禁中 `dev-rxdb-http-server:test` 与 `dev-rxdb-angular-e2e:e2e` 因本机并行负载出现钩子超时 / 拖拽 flaky，与本改动无关；单跑均全绿后第三次全量 272/272 通过，nx 标记 2 个 flaky 任务）

## 排障记录（第 2 步踩过的坑）

1. **PG 递归 CTE 必须写 `RECURSIVE`**：裸 `WITH` 的自引用被当普通表查找（`relation "reach" does not exist`），与 SQLite 语法不兼容。
2. **递归项子查询引用不了兄弟 CTE**（两后端同病）：PG 报 `missing FROM-clause entry for table "s"`、SQLite 报 `no such column: s.x`——作用域三元组（bomType / orgId / parentItem）一律内联成标量子查询。
3. **判环递归项要「到达父物料即停止延伸」**：UNION ALL 不去重，成环边插入时路径沿环重复枚举（a→b→c→a→…），多重边下指数爆炸（探针 9.4s 挂起）——`WHERE reach.depth < 128 AND reach.item_id <> <parent>`，路径终止于父正是错误消息要的环路径。
4. **PG 递归项不能带 LIMIT**（SQLite 的 LIMIT 只限每迭代层宽）——US-510 的预算结算放 TS 侧按 BFS 逐层做，AC#10 的百万路径结构才能提前停（恰好返回 10,000 条）。
5. **`LocalRxDBAdapter` 跨包不可结构兼容**：交叉类型带私有成员，wa-sqlite 适配器不继承 `RxDBAdapterLocalBase`（TS 报 `repository_map` 不兼容）——插件自声明 `BomLocalAdapter`（`name` / `transaction` / `rawQuery` 三成员）最小适配器面。
6. **SQLite 同表多触发器按创建倒序触发**：十进制格式触发器先于判环创建，自环 fixture 上判环错误先浮出——fixture 改独立子件（自环本就是 US-509 落地后的非法结构）。
7. **判环落地后旧 fixture 变非法**：US-507 时代的 schema 测试用同一物料当父子，US-509 保守政策拒绝自环——测试 fixture 改成独立子件，AC#11 的「修订必须属于子件」也因此不再被自环误拒而虚化。
8. **测试装配**：itemNo 带唯一索引，同 describe 共享一个库——每次建图加随机前缀；PG 的 uuid 列要求直连 SQL 的假 id 也是合法 uuid（否则类型转换先于触发器报错）。

## 下一步（第 3 步）

US-511 阶段 A / C + B1（四态用量、量纲与单位换算、十进制值合同与阶梯切片、phantom 穿透、装配与组件损耗）。
