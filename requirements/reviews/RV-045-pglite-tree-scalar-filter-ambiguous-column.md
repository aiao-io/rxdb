---
id: RV-045
title: PGlite 树查询普通字段筛选生成歧义列名
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-045：PGlite 树查询普通字段筛选生成歧义列名

## 问题

🔴 **P2，确认问题，待修复。** 合法的树查询条件 `title contains visible` 在真实 PGlite 的 findDescendants / findAncestors / 两个 count 方法均报 SQLSTATE 42702：`column reference "title" is ambiguous`。无 where 的查询正常，树结构和普通字段数据不是错误来源。

## 根因

[query_tree_sql.ts](../../packages/rxdb-adapter-pglite/src/query/query_tree_sql.ts) 第 83–101 行只为已经写成 `children.field` 的条件建立 alias。正常公开字段 `title` 没有映射，buildRuleGroupPG 输出未限定的 `"title"`；递归项同时有原表 children 和 CTE c，两者都带 title，导致歧义。

SQLite 的 [对应生成器](../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts) 已按 metadata 属性/外键建立完整树字段 alias，不能以两端入口同名当作语义已对齐。

## 复验

[真实 PGlite spec](../../packages/rxdb-adapter-pglite/src/__tests__/review-tree-filter-incremental.spec.ts) 用实际 RxDB/PGlite memory、MenuSimple 两节点和树插件。直接 await 后端树 repository，捕获真实 SQL 拒绝，不用等超时替代故障。

**4 failed / 2 passed**：[日志](evidence/2026-10-04/tree-devtools/tree-scalar-filter-pglite.txt) / [状态](evidence/2026-10-04/tree-devtools/tree-scalar-filter-pglite-status.json)。失败 SQL 明确是 `JOIN __children c ... WHERE ... AND "title" LIKE $2`。初始公开 observable 复验在初次快照就失败，未进入增量阶段；该历史日志保留，不把它当作增量漂移的证明。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:test --args='src/__tests__/review-tree-filter-incremental.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

树递归项为所有普通属性、实际 columnName 和外键建立 children 限定映射，保留支持的显式 children.field 和关系条件；不要求所有 consumer 改写为 SQL 表别名，不改变公共 where 字段语义。补 property/columnName 不同、嵌套条件、加密字段拒绝、四个方法与 SQLite 对照。

## 解决记录

- [x] 真实 PostgreSQL 拒绝与无筛选对照保留；业务实现未改。
- [ ] 对齐树字段 alias，复跑后端与公开 observable。
- [ ] 当前 Open。
