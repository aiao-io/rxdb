---
id: CS-007
number: 7
status: Open
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/date/msTimeToMilliseconds.ts
line: 37
created: 2026-08-16
updated: 2026-08-16
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

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
