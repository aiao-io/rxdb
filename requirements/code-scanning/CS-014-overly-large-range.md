---
id: CS-014
number: 14
status: Resolved
rule: js/overly-large-range
severity: warning
security_severity: medium
path: packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts
line: 31
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/14
---

# CS-014 Overly permissive regular expression range

## 规则

- ID：`js/overly-large-range`
- 名称：Overly permissive regular expression range
- 描述：Overly permissive regular expression range

## 位置

`packages/rxdb-adapter-pglite/src/__tests__/encrypted-test-fixture.ts:31`

## 告警

Suspicious character range that overlaps with \w in the same character class.

## 修复方案

**修 —— 与 [CS-013](./CS-013-overly-large-range.md) 是同一个字符类、同一次修复。**

`[A-Za-z"$\w]` 里 `A-Z` 与 `a-z` 两段都与 `\w` 重叠，CodeQL 各报一次。收成 `[\w"$]` 后两条同时消除。

细节见 [CS-013](./CS-013-overly-large-range.md)。

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
