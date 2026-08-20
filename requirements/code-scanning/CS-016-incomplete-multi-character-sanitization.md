---
id: CS-016
number: 16
status: Dismissed
rule: js/incomplete-multi-character-sanitization
severity: warning
security_severity: high
path: apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts
line: 22
created: 2026-08-16
updated: 2026-08-20
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

**不修 —— `stripHtmlComments` 是**测试断言辅助**，不是 sanitizer。**

它在 [renderer-shell.spec.ts](../../apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts) 里的唯一用途，是把生成的 HTML 里的注释去掉后再和期望字符串比对。输入是同一个测试文件里写死的常量，不经过网络、不渲染到任何页面。补齐「多字符净化」的循环处理只会让一个断言辅助函数更难读。

**注意告警编号已滚动**：GitHub 上 alert 16 已于 2026-08-19 被标记 `fixed`，但同一规则 / 同一路径 / 同一行随即以 **alert 23** 重新报出，见 [CS-023](./CS-023-incomplete-multi-character-sanitization.md)。本文件保留为历史记录，实际待关闭的是 CS-023。

**GitHub 上关闭方式**：本条无需操作（已是 fixed），对 CS-023 执行 dismiss。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
