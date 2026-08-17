---
id: CS-015
number: 15
status: Open
rule: js/double-escaping
severity: warning
security_severity: high
path: website/scripts/flatten-api-docs.mjs
line: 196-199
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/15
---

# CS-015 Double escaping or unescaping

## 规则

- ID：`js/double-escaping`
- 名称：Double escaping or unescaping
- 描述：Double escaping or unescaping

## 位置

`website/scripts/flatten-api-docs.mjs:196-199`

## 告警

This replacement may produce '&' characters that are double-unescaped here.

## 修复方案

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
