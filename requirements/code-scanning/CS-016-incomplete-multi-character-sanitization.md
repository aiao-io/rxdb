---
id: CS-016
number: 16
status: Open
rule: js/incomplete-multi-character-sanitization
severity: warning
security_severity: high
path: apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts
line: 22
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/16
---

# CS-016 Incomplete multi-character sanitization

## 规则

- ID：`js/incomplete-multi-character-sanitization`
- 名称：Incomplete multi-character sanitization
- 描述：Incomplete multi-character sanitization

## 位置

`apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22`

## 告警

`This string may still contain <!--, which may cause an HTML element injection vulnerability.`

## 修复方案

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
