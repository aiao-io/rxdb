---
id: CS-006
number: 6
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/date/isMSTime.ts
line: 25
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/6
---

# CS-006 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/date/isMSTime.ts:25`

## 告警

This regular expression that depends on library input may run slow on strings with many repetitions of '00'.

## 修复方案

**修 —— 属于发布包 `@aiao/utils`，`isMSTime` 是公开类型谓词，输入任意。**

与 **[CS-007](./CS-007-polynomial-redos.md) 是同一处代码**：`MS_TIME_PATTERN` 被 `isMSTime` 与 `msTimeToMilliseconds` 共用，CodeQL 按两个入口各报一次，一次修复同时关掉两条。

上游 vercel/ms 的 `-?(?:\d+)?\.?\d+` 让两个 `\d+` 对同一串数字有 O(n) 种切分，末尾跟一个不匹配的字符就逼引擎把所有切分走一遍，`'0'.repeat(50000) + 'x'` 实测 **10189ms**。

改写成无歧义的 `-?(?:\d+(?:\.\d+)?|\.\d+)`。接受的字符串集合完全相同 —— `'1.'` 两边都拒（小数点后必须有数字），`'.5'` 两边都收。

- 实现：[ms-time-pattern.ts](../../packages/utils/src/date/ms-time-pattern.ts)
- 测试：[isMSTime.spec.ts](../../packages/utils/src/__tests__/date/isMSTime.spec.ts) —— 1 条 ReDoS + 7 条合法 + 5 条非法，把边界等价性钉死

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
