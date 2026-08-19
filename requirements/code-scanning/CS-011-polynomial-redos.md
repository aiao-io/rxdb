---
id: CS-011
number: 11
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/string/urlJoin.ts
line: 106-109
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/11
---

# CS-011 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/string/urlJoin.ts:106-109`

## 告警

This regular expression that depends on library input may run slow on strings with many repetitions of '/'.

## 修复方案

**修 —— 与 [CS-010](./CS-010-polynomial-redos.md) 是同一个正则、同一次修复。**

`/\/+$/` 在 `isRootPrefix` 与片段归一化两处被调用，CodeQL 按两个入口各报一次。统一换成线性的 `stripTrailingSlash` 后两条同时消除。

细节见 [CS-010](./CS-010-polynomial-redos.md)。

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
