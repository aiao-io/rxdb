---
id: CS-005
number: 5
status: Open
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts
line: 106
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/5
---

# CS-005 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:106`

## 告警

This regular expression that depends on library input may run slow on strings starting with 'sqlite3-opfs-async-proxy-' and with many repetitions of 'sqlite3-opfs-async-proxy-'.

## 修复方案

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
