---
id: CS-004
number: 4
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts
line: 11-13
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/4
---

# CS-004 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts:11-13`

## 告警

This regular expression that depends on library input may run slow on strings with many repetitions of ';'.

## 修复方案

**修 —— 属于发布包 `@aiao/rxdb-adapter-sqlite-core`，`sql` 由调用方传入。**

`/;+\s*$/u` 在分号串后面还有内容时（`'a' + ';'.repeat(30000) + 'b'`），每个起点都要吃完整串再逐个回退，实测 **3268ms**。

改为线性扫描剥掉末尾连续分号。语义完全不变 —— `.trim()` 之后 `\s*$` 只能匹配空串，正则实际只剥「末尾**连续**的分号」，被空格隔开的 `'select 1; ;'` 两种写法结果一致。

- 实现：[execute-sql.utils.ts](../../packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts)
- 测试：新建 [execute-sql.utils.spec.ts](../../packages/rxdb-adapter-sqlite-core/src/__tests__/execute-sql.utils.spec.ts) —— 8 条归一化用例 + 1 条 ReDoS 用例

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
