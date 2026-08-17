---
id: CS-020
number: 20
status: Open
rule: js/missing-origin-check
severity: warning
security_severity: medium
path: benchmarks/src/hooks/useTheme.ts
line: 36
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/20
---

# CS-020 Missing origin verification in postMessage handler

## 规则

- ID：`js/missing-origin-check`
- 名称：Missing origin verification in `postMessage` handler
- 描述：Missing origin verification in `postMessage` handler

## 位置

`benchmarks/src/hooks/useTheme.ts:36`

## 告警

Postmessage handler has no origin check.

## 修复方案

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
