---
id: CS-009
number: 9
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/utils/src/string/stringTemplate.ts
line: 11
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/9
---

# CS-009 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/utils/src/string/stringTemplate.ts:11`

## 告警

This regular expression that depends on library input may run slow on strings starting with '${{' and with many repetitions of '${{|'.

## 修复方案

**修 —— 属于发布包 `@aiao/utils`，`stringTemplate` 的模板串来自调用方。**

`\${([^}]+)}` 在没有闭合括号的模板上（`'${'.repeat(20000)`）会从每一个 `${` 一路扫到串尾才发现没有 `}`，实测 **1184ms**。

字符类收紧为 `[^{}]+`：遇到下一个 `{` 立刻失败，不再扫到串尾。代价是含 `{` 的占位符不再被识别 —— `${` 是唯一开界符，对象路径里不可能出现 `{`，这类模板原本也只会取到默认值空串，改动后原样保留反而更诚实。

- 实现：[stringTemplate.ts](../../packages/utils/src/string/stringTemplate.ts)
- 测试：[stringTemplate.spec.ts](../../packages/utils/src/__tests__/string/stringTemplate.spec.ts) —— 1 条 ReDoS，1 条把行为差异直接写进断言

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
