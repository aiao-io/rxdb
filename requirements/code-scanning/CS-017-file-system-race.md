---
id: CS-017
number: 17
status: Resolved
rule: js/file-system-race
severity: warning
security_severity: high
path: scripts/coverage-serve.mjs
line: 729
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/17
---

# CS-017 Potential file system race condition

## 规则

- ID：`js/file-system-race`
- 名称：Potential file system race condition
- 描述：Potential file system race condition

## 位置

`scripts/coverage-serve.mjs:729`

## 告警

The file may have changed since it was checked.

## 修复方案

**修 —— 告警本身是 TOCTOU，但顺着查出来一个能**弄死 dev server** 的真缺陷。**

原流程是 `existsSync` → `statSync` → `existsSync` → `statSync` → `isWithinRoot` → `readFileSync`，而最后这个 `readFileSync` **不在任何 try 里**，`createServer` 回调外层也没有兜底。覆盖率目录恰好是被 vitest 并发重写的，预检与真正读取之间文件被换掉（ENOENT）就会抛到 `'request'` 之外，整个 `coverage:serve` 进程当场消失。

改为「先读、读不到再退 `index.html`、还读不到就 404」，`tryReadFile` 吞掉所有 IO 错误，预检全部删掉 —— 预检的结论在拿到手的瞬间就已经过期，本就不该信。

**刻意保留的顺序**：`isWithinRoot` 仍在 `send` **之前**。内容虽已读进内存，但根外的字节一个都不会写给客户端，软链越界防线未削弱。

- 实现：[coverage-serve.mjs](../../scripts/coverage-serve.mjs)
- 验证：本地起服务实测 —— `/` 200、目录自动补 `index.html` 200、缺失 404，`/../../../etc/passwd`、`/%2e%2e/%2e%2e/etc/passwd`、`/packages/../../package.json` 全 403，且进程始终存活

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
