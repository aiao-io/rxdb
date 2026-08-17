---
id: CS-004
number: 4
status: Open
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts
line: 11-13
created: 2026-08-16
updated: 2026-08-16
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

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
