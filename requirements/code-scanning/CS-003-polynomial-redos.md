---
id: CS-003
number: 3
status: Open
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/rxdb/src/rxdb-utils.ts
line: 169
created: 2026-08-16
updated: 2026-08-16
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

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
