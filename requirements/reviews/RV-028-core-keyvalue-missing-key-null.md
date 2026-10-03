---
id: RV-028
title: keyValue 缺失键被 JS 转成字符串，违反 SQLite NULL 语义
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
---

# RV-028：keyValue 缺失键被 JS 转成字符串，违反 SQLite NULL 语义

**P2 · 已动态复验 · 待修复**。对象：`packages/rxdb`、`packages/rxdb-adapter-sqlite-core`。本记录针对实际业务源码，不是评审计划。

## 问题

合法数据 `{meta: {}}` 含有空键值对象，查询条件引用不存在的 `theme` 键：

| 规则                                 | SQLite JSON1 | 核心 JS |
| ------------------------------------ | ------------ | ------- |
| `meta notContains {theme: 'dark'}`   | false        | true    |
| `meta contains {theme: 'undefined'}` | false        | true    |

缺失键不是字面字符串 `"undefined"`。两个结果都意味着核心内存复算与全量 SQLite 查询不一致。

## 源码证据与根因

- [核心 `get_entity_match_rule`](../../packages/rxdb/src/query/query-matching.utils.ts) 只在整个字段为 NULL/undefined 时应用 `NULL_EXCLUDED_OPERATORS`；对象内部按 `` `${(entityValue as Record<string, unknown>)[key]}`.includes(`${v}`) `` 比较。
- 空对象字段本身非空，因此缺失键绕过上面的 NULL 短路，被变成 `"undefined"`；最后 `notContains` 再直接取反，丢失 UNKNOWN。
- [SQLite `handle_flatmap_contains` / `build_substring_condition`](../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts) 使用 `json_extract(_."meta", '$.theme')`；缺失键为 SQL NULL，`instr(NULL, ...) > 0` 和 `= 0` 都不能使 WHERE 为 TRUE。

## 动态复验

[复验 spec](../../packages/rxdb-adapter-sqlite-core/src/__tests__/review-query-audit.spec.ts) 前两个用例调用当前 SQL 构建器，对真实 Node `DatabaseSync(':memory:')` JSON1 数据执行，并与核心公开匹配函数比较：两例均为 SQL false / JS true，两个断言均失败。[原始结果](evidence/2026-10-03/query-probes-round2.log) 已留存。

```bash
CI=true NX_DAEMON=false pnpm nx run-many -t test --projects=rxdb-adapter-pglite,rxdb-adapter-sqlite-core --parallel=1 --args='src/__tests__/review-query-audit.spec.ts --run --browser.enabled=false --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

这是编译器＋真实 SQLite 引擎＋核心匹配器的证据；本轮没有把 wa-sqlite/Worker/Electron/Tauri 全宿主测试声明为通过，也没有完成整条订阅链路的端到端补证。

## 修复方案

按逐键 SQL 真值组合处理缺失值，保留 contains 的 OR、notContains 的 AND/UNKNOWN 语义；不要先把缺失值 stringify 再取反。补混合键（缺失＋匹配、缺失＋不匹配）、空对象及真实 `"undefined"` 字符串用例，并与 RV-027 一起核对 PGlite 语义，不要仅补一个 if 掩盖其他组合。

## 解决记录

- [ ] 按复验用例保持红，先修根因，再确认绿。
- [ ] 补关联路径回归与适用的三框架/宿主证据。
- [ ] 修复合并后按评审目录规则清理；目前未修改业务实现、未宣称解决。
