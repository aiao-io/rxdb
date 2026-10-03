---
id: RV-034
title: PGlite 数组 in/notIn 把交集查询编译成了全包含
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
---

# RV-034：PGlite 数组 in/notIn 把交集查询编译成了全包含

**P2 · 确认问题，待修复**；业务实现未在本轮修改。

## 问题

合法 stringArray 数据 `tags=['alpha']`，候选值 `['alpha','beta']`：`in` 在核心 JS 中 true、PGlite 中 false；`notIn` 核心 false、PGlite true。

## 根因与源码证据

[PGlite build_rule_pg 的数组分支](../../packages/rxdb-adapter-pglite/src/query/query_sql.ts) 使用 `tags @> $1::text[]`（或 numeric[]），要求包含所有候选值。 [核心 get_entity_match_rule](../../packages/rxdb/src/query/query-matching.utils.ts) 对数组用 `.some(item => value.includes(item))`，是任一元素交集。 [SQLite handle_array_in](../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts) 的 json_each / IN 路径同样是任一交集。

## 动态复验

[当前 SQL 构建器＋真实 PGlite 的复验 spec](../../packages/rxdb-adapter-pglite/src/__tests__/review-array-membership.spec.ts) 两个一致性断言均失败；[日志](evidence/2026-10-03/full-run/pglite-array-probe.log) 包含实际 SQL、数组参数和两侧结果。

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:test --args='src/__tests__/review-array-membership.spec.ts --run --browser.enabled=false --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

明确保持现有核心/SQLite 的 in=存在交集、notIn=不存在交集契约，对原生数组选择对应谓词，而不是 JSONB/数组全包含。补 stringArray/numberArray、部分交集、全交集、无交集、空候选与 NULL 的共享 conformance，并保留 RV-029 的空集合边界。本轮没有声称已完成完整 Repository 增量端到端证明。

## 解决记录

- [ ] 保留失败复验/门禁证据并定位最小修法。
- [ ] 修复后复跑关联回归，不用缓存或跳过换绿。
- [ ] 合并后按评审目录清理规则处理；当前仍 Open。
