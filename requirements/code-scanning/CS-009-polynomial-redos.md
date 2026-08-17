---
id: CS-009
number: 9
status: Open
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/string/stringTemplate.ts
line: 11
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/9
---

# CS-009 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/string/stringTemplate.ts:11`

## 告警

This regular expression that depends on library input may run slow on strings starting with '${{' and with many repetitions of '${{|'.

## 修复方案

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
