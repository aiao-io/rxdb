---
id: CS-023
number: 23
status: Dismissed
rule: js/incomplete-multi-character-sanitization
severity: warning
security_severity: high
path: apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts
line: 22
created: 2026-08-19
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/23
---

# CS-023 Incomplete multi-character sanitization

## 规则

- ID：`js/incomplete-multi-character-sanitization`
- 名称：Incomplete multi-character sanitization
- 描述：Incomplete multi-character sanitization

## 位置

`apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts:22`

## 告警

This string may still contain <!--, which may cause an HTML element injection vulnerability.

## 备注：与 CS-016 的关系

同一规则、同一路径、同一行。GitHub 上 alert 16 已于 2026-08-19 被标记 `fixed`，随即以本条 alert 23 重新报出 —— 编号滚动而非新问题。[CS-016](./CS-016-incomplete-multi-character-sanitization.md) 保留为历史记录，实际待关闭的是本条。

## 修复方案

**不修 —— `stripHtmlComments` 是**测试断言辅助**，不是 sanitizer。**

它在 [renderer-shell.spec.ts](../../apps/dev-rxdb-electron/src-electron/renderer-shell.spec.ts) 里的唯一用途，是把生成的 HTML 里的注释去掉后再和期望字符串比对。输入是同一个测试文件里写死的常量，不经过网络、不渲染到任何页面，输出只进 `expect()`。

按规则建议补上「循环净化直到不动点」，只会让一个断言辅助函数更难读，而它防的那个攻击面在这里根本不存在。

**GitHub 上关闭方式**：dismiss reason 选 `used in tests`。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
