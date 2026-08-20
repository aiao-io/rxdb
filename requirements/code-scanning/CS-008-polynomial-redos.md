---
id: CS-008
number: 8
status: Dismissed
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/object/isEqual.ts
line: 105
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/8
---

# CS-008 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/object/isEqual.ts:105`

## 告警

This regular expression that depends on library input may run slow on strings with many repetitions of 'a'.

## 修复方案

**不修 —— 误报（false positive），这行代码里根本没有正则。**

硬证据三条：

1. 告警自带的列范围是 `105:12-105:22`，落在 [isEqual.ts](../../packages/utils/src/object/isEqual.ts) 的 `b.has(key)` 上 —— 这是 `Map` / `Set` 的成员判断，不是正则执行。
2. 整个 `isEqual.ts` 只在第 97 行出现过一次 `RegExp`，且是 `a instanceof RegExp` 的类型分支，全文没有任何 `test` / `match` / `exec`。
3. 在告警基线 `1b09d39` 与当前分析 sha `7dd6609b` 两个版本上文件内容一致，不存在「已改掉但告警滞后」的可能。

CodeQL 把 `Set.prototype.has` 的多项式查找路径误判成了正则回溯。

**GitHub 上关闭方式**：dismiss reason 选 `false positive`。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
