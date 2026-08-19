---
id: CS-013
number: 13
status: Resolved
rule: js/overly-large-range
severity: warning
security_severity: medium
path: packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts
line: 31
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/13
---

# CS-013 Overly permissive regular expression range

## 规则

- ID：`js/overly-large-range`
- 名称：Overly permissive regular expression range
- 描述：Overly permissive regular expression range

## 位置

`packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31`

## 告警

Suspicious character range that overlaps with \w in the same character class.

## 修复方案

**修 —— 一行改动，零风险，顺手清掉。**

与 **[CS-014](./CS-014-overly-large-range.md) 同一文件同一行**，CodeQL 对 `[A-Za-z"$\w]` 里 `A-Z` 与 `a-z` 两段各报一次。

后顾断言 `(?<![A-Za-z"$\w])` 里 `\w` 已经完整包含 `A-Za-z`，多余的显式范围只会让人怀疑写错了。收成 `(?<![\w"$])` —— 匹配集合逐字符相同。

- 实现：[encrypted-test-fixture.ts](../../packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts)
- 验证：`rxdb-adapter-pglite` 全量 1011 tests 绿

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
