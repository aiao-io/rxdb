---
id: CS-014
number: 14
status: Open
rule: js/overly-large-range
severity: warning
security_severity: medium
path: packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts
line: 31
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/14
---

# CS-014 Overly permissive regular expression range

## 规则

- ID：`js/overly-large-range`
- 名称：Overly permissive regular expression range
- 描述：Overly permissive regular expression range

## 位置

`packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31`

## 告警

Suspicious character range that overlaps with \w in the same character class.

## 修复方案

<!-- 待补充。与 CS-013 同一文件同一行，CodeQL 分两次报告 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
