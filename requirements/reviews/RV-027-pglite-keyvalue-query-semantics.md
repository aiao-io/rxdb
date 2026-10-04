---
id: RV-027
title: PGlite keyValue contains 与核心/SQLite 查询语义不一致
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
---

# RV-027：PGlite keyValue contains 与核心/SQLite 查询语义不一致

**P2 · 已动态复验 · 待修复**。对象：`packages/rxdb-adapter-pglite`、`packages/rxdb`。本记录针对实际业务源码，不是评审计划。

## 问题

同一份合法 `keyValue` 数据和 `contains` 规则，在 PGlite SQL 与核心 JS 匹配器中得到相反结果：

| 数据                              | contains 规则值                  | PGlite SQL | 核心 JS |
| --------------------------------- | -------------------------------- | ---------- | ------- |
| `{theme: 'light'}`                | `{theme: 'li'}`                  | false      | true    |
| `{theme: 'light', mode: 'light'}` | `{theme: 'light', mode: 'dark'}` | false      | true    |

这不是无效输入：`KeyValue` 允许字符串值，规则使用现有 `contains` 操作符。影响是同一 API 的后端切换语义不一致，且 JS 复算不能作为 PGlite 查询的等价判据。

## 源码证据与根因

- [PGlite `buildRuleGroupPG` / `build_rule_pg`](../../packages/rxdb-adapter-pglite/src/query/query_sql.ts) 的 `prop.type === PropertyType.json || prop.type === PropertyType.keyValue` 分支，统一编译为 `"meta" @> $1::jsonb`。`@>` 是 JSON 对象子集包含，要求对应值相等、多个键同时满足。
- [核心 `get_entity_match_rule`](../../packages/rxdb/src/query/query-matching.utils.ts) 的对象 `contains` 分支使用逐键 `String.includes` 再 `.some(Boolean)`：字符串按子串、多个键按 OR。
- [SQLite `handle_flatmap_contains`](../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts) 同样按逐键字面子串、OR 编译，不是 PGlite 的对象子集匹配。

问题是把 `PropertyType.keyValue` 的既有谓词语义与 `PropertyType.json` 的原生 JSONB 子集运算混到一个分支里，而不是缺少输入校验。

## 动态复验

[复验 spec](../../packages/rxdb-adapter-pglite/src/__tests__/review-query-audit.spec.ts) 前两个用例从当前源码构建 SQL，并对真实 Node PGlite 内存数据库执行，然后与公开 `isEntityMatchWhere` 比较。两个断言均稳定失败；[原始结果](evidence/2026-10-03/query-probes-round2.txt) 包含 SQL、参数、输入和两侧布尔值。

```bash
CI=true NX_DAEMON=false pnpm nx run-many -t test --projects=rxdb-adapter-pglite,rxdb-adapter-sqlite-core --parallel=1 --args='src/__tests__/review-query-audit.spec.ts --run --browser.enabled=false --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

本轮另尝试公开 Repository 订阅场景，未证明该场景产生额外行，因此**没有把订阅漂移写成已动态复现的结论**。已确认的是 SQL/JS 的确定性语义差异及 SQLite/PGlite 的编译差异；完整用户链路需在修复回归时补证。

## 修复方案

1. 对 `keyValue` 对齐既有 SQLite/核心的逐键字面子串语义与组合规则；不要直接改变 `PropertyType.json` 已提供的 JSONB 子集能力。
2. 把这两例纳入后端共享 conformance，并补 `notContains`、空对象、缺失键、NULL、关系穿透字段。
3. 补真实 Repository 初查/CREATE/UPDATE/刷新对照，并通过三框架消费端复验；不以更新 API baseline 代替语义兼容验证。

## 解决记录

- [ ] 按复验用例保持红，先修根因，再确认绿。
- [ ] 补关联路径回归与适用的三框架/宿主证据。
- [ ] 修复合并后按评审目录规则清理；目前未修改业务实现、未宣称解决。
