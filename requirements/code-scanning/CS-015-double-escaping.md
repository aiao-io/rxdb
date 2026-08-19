---
id: CS-015
number: 15
status: Resolved
rule: js/double-escaping
severity: warning
security_severity: high
path: website/scripts/flatten-api-docs.mjs
line: 196-199
created: 2026-08-16
updated: 2026-08-20
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

**修 —— 这条不只是告警，是**真 bug**。**

链式 `.replace(/&lt;/g,…).replace(/&gt;/g,…).replace(/&amp;/g,'&').replace(/&quot;/g,…).replace(/&#39;/g,…)` 里，`&amp;` 先被解成 `&`，后两步再把新生成的 `&` 当作实体开头解第二次：`&amp;quot;`（本意是**字面量** `&quot;`）被错解成 `"`，同理 `&amp;lt;` 被错解成 `<`。

改成单次扫描 `replace(/&(?:lt|gt|amp|quot|#39);/g, e => HTML_ENTITY_DECODE_MAP[e])`，每个实体只解一次，顺序不再有意义。

- 实现：[flatten-api-docs.mjs](../../website/scripts/flatten-api-docs.mjs)

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
