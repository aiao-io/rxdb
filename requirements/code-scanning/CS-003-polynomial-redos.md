---
id: CS-003
number: 3
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/rxdb/src/rxdb-utils.ts
line: 169
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/3
---

# CS-003 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/rxdb/src/rxdb-utils.ts:169`

## 告警

This regular expression that depends on library input may run slow on strings starting with 'adapter' and with many repetitions of 'adapter'.

## 修复方案

**修 —— 属于发布包 `@aiao/rxdb`，message 来自任意底层驱动。**

`ADAPTER_SHUTDOWN_ERROR_PATTERN` 里 `adapter is disconnected` 与 `adapter.*closed` 两个分支共享 `adapter` 前缀而后半段歧义，`'adapter'.repeat(20000)` 这种 message 上每个起点的每种切分都要走一遍，实测退化到 **4286ms**。

改为「小写短语表 `includes` + `adapter … closed` 两次 `indexOf` 顺序判定」，全线性。语义唯一的差别：正则 `.` 不跨行、`indexOf` 跨行 —— 多行 message 里 `adapter` 与 `closed` 分处两行同样算关闭错误，这本就是期望行为。

- 实现：[packages/rxdb/src/rxdb-utils.ts](../../packages/rxdb/src/rxdb-utils.ts)
- 测试：[rxdb-utils.spec.ts](../../packages/rxdb/src/__tests__/rxdb-utils.spec.ts) —— 13 条语义用例锁住原行为，1 条 ReDoS 用例（< 200ms）

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
