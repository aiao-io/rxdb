---
id: CS-012
number: 12
status: Open
rule: js/shell-command-injection-from-environment
severity: warning
security_severity: medium
path: website/scripts/build-website.mjs
line: 113
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/12
---

# CS-012 Shell command built from environment values

## 规则

- ID：`js/shell-command-injection-from-environment`
- 名称：Shell command built from environment values
- 描述：Shell command built from environment values

## 位置

`website/scripts/build-website.mjs:113`

## 告警

This shell command depends on an uncontrolled file name.

## 修复方案

<!-- 待补充 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
