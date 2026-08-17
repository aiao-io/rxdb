---
id: CS-021
number: 21
status: Open
rule: js/log-injection
severity: error
security_severity: medium
path: scripts/e2e-static-server.mjs
line: 220
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/21
---

# CS-021 Log injection

## 规则

- ID：`js/log-injection`
- 名称：Log injection
- 描述：Log injection

## 位置

`scripts/e2e-static-server.mjs:220`

## 告警

Log entry depends on a user-provided value.

## 修复方案

<!-- 待补充。唯一 error 级，优先修 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
