---
id: CS-008
number: 8
status: Open
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/object/isEqual.ts
line: 105
created: 2026-08-16
updated: 2026-08-16
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

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
