---
id: CS-007
number: 7
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/date/msTimeToMilliseconds.ts
line: 37
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/7
---

# CS-007 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/date/msTimeToMilliseconds.ts:37`

## 告警

This regular expression that depends on library input may run slow on strings with many repetitions of '00'.

## 修复方案

**修 —— 与 [CS-006](./CS-006-polynomial-redos.md) 是同一个正则、同一次修复。**

`MS_TIME_PATTERN` 被 `isMSTime` 与 `msTimeToMilliseconds` 共用，CodeQL 按两个入口各报一次告警。数值部分改写为无歧义的 `-?(?:\d+(?:\.\d+)?|\.\d+)` 后两条同时消除。

细节见 [CS-006](./CS-006-polynomial-redos.md)。

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
