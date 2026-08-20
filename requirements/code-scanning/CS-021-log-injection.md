---
id: CS-021
number: 21
status: Resolved
rule: js/log-injection
severity: error
security_severity: medium
path: scripts/e2e-static-server.mjs
line: 220
created: 2026-08-16
updated: 2026-08-20
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

**修 —— 本批唯一的 error 级告警，改动只有一行。**

[e2e-static-server.mjs](../../scripts/e2e-static-server.mjs) 把来自 `req.url` 的 `filePath` 直接交给 `console.error`。原注释只防住了 format string（`%s` 被当占位符），没防 CR/LF —— 一个 `GET /%0A[ok]%20all%20tests%20passed` 就能在 e2e 日志里伪造出一整行，排查时极具误导性。

改用 `JSON.stringify(filePath)`：控制字符被转义成 `\n`，一条请求永远只占一行；这同时也是 CodeQL 认可的 log-injection barrier。

- 实现：[e2e-static-server.mjs](../../scripts/e2e-static-server.mjs)
- 验证：[e2e-static-server.spec.mjs](../../scripts/e2e-static-server.spec.mjs) 12 tests 全绿

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
