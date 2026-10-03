---
id: RV-029
title: 空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
---

# RV-029：空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致

**P2 · 已动态复验 · 待修复**。对象：`packages/rxdb`、`packages/rxdb-adapter-sqlite-core`、`packages/rxdb-adapter-pglite`。本记录针对实际业务源码，不是评审计划。

## 问题

对合法 nullable 字符串字段 `tag`，规则 `tag notIn []`：SQLite 与 PGlite 都返回 `tag = NULL` 的行，核心 `isEntityMatchWhere({tag: null}, where)` 却返回 false。

空集合是合法值，不是非法/缺省参数。全量查询与内存复算因此对同一行作出不同判断。

## 源码证据与根因

- [核心 `get_entity_match_rule` 的 NULL 前置短路](../../packages/rxdb/src/query/query-matching.utils.ts)：`NULL_EXCLUDED_OPERATORS` 包含 `notIn`，在进入 `in`/`notIn` 分支之前就返回 false。
- [SQLite `build_rule`](../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts) 的空数组分支明确返回 `notIn -> '1 = 1'`。
- [PGlite `buildRuleGroupPG` / `build_rule_pg`](../../packages/rxdb-adapter-pglite/src/query/query_sql.ts) 的空数组分支同样返回 `notIn -> '1=1'`。

把“非空集合比较下的 NULL 三值逻辑”无差别应用到“空集合已被归一化成恒真”的场景，造成了分层契约冲突。

## 动态复验

两份 [SQLite spec](../../packages/rxdb-adapter-sqlite-core/src/__tests__/review-query-audit.spec.ts) / [PGlite spec](../../packages/rxdb-adapter-pglite/src/__tests__/review-query-audit.spec.ts) 的最后一个用例分别创建真实数据库、插入 NULL、执行当前构建器 SQL：两侧 SQL 均 true，核心 JS 均 false，两个一致性断言均失败。[原始结果](evidence/2026-10-03/query-probes-round2.log) 包含 `1 = 1` / `1=1` 与结果。

```bash
CI=true NX_DAEMON=false pnpm nx run-many -t test --projects=rxdb-adapter-pglite,rxdb-adapter-sqlite-core --parallel=1 --args='src/__tests__/review-query-audit.spec.ts --run --browser.enabled=false --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 修复方案

将空 `in` / `notIn` 的恒假/恒真语义在核心统一归一化，再应用非空集合的 NULL 规则；优先保持两种后端当前行为，避免修一个分支却破坏既有全量查询。共享套件需覆盖 nullable/非空字段、标量/数组列、空/非空集合及 CREATE/UPDATE 的实际查询刷新。

## 解决记录

- [ ] 按复验用例保持红，先修根因，再确认绿。
- [ ] 补关联路径回归与适用的三框架/宿主证据。
- [ ] 修复合并后按评审目录规则清理；目前未修改业务实现、未宣称解决。
