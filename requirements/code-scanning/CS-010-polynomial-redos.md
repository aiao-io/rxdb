---
id: CS-010
number: 10
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/string/urlJoin.ts
line: 19
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/10
---

# CS-010 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/string/urlJoin.ts:19`

## 告警

This regular expression that depends on library input may run slow on strings with many repetitions of '/'.

## 修复方案

**修 —— 属于发布包 `@aiao/utils`，`urlJoin` 的片段来自调用方。**

与 **[CS-011](./CS-011-polynomial-redos.md) 是同一个 `/\/+$/`**，分别在 `isRootPrefix` 与片段归一化两处调用，CodeQL 各报一次，一次修复关掉两条。

触发条件是「长 `/` 串**不在**末尾」：`'a' + '/'.repeat(30000) + 'b'` 上每个起点都要把整串吃完再逐个回退，两处实测各 **1330ms**。（`/` 串正好在末尾时首次尝试就命中 `$`，反而不回溯 —— 第一版用例因此没红，这一点写进了代码注释，免得下一个人重蹈。）

抽出线性的 `stripTrailingSlash` 替换。开头的 `/^\/+/` 只有一个起点，不受影响，保持原样。

- 实现：[urlJoin.ts](../../packages/utils/src/string/urlJoin.ts)
- 测试：[urlJoin.spec.ts](../../packages/utils/src/__tests__/string/urlJoin.spec.ts) —— 2 条 ReDoS（覆盖前缀与片段两条调用路径）+ 3 条行为等价性断言（首尾 `/` 仍剥、中间 `/` 仍留）

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
