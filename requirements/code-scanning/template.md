---
id: CS-XXX
number: 0 # GitHub code scanning alert number（编号与此一一对应）
status: Open # Open / Resolved / Dismissed
rule: js/xxx
severity: warning # error / warning / note
security_severity: high # high / medium / low
path: <repo-relative-path>
line: <start>[-<end>]
created: 2026-08-16
updated: 2026-08-16
url: https://github.com/aiao-io/rxdb/security/code-scanning/0
---

# CS-XXX [规则名]

## 规则

- ID：`js/xxx`
- 名称：[CodeQL rule name]
- 描述：[CodeQL rule description]

## 位置

`<path>:<line>`

## 告警

[CodeQL message，逐字引用]

## 修复方案

<!-- 待补充：怎么修。断言带证据锚点（符号名 / 短代码引用 / 行号），见 requirements/template.md 写作规范 -->

## 解决记录

- [ ] 修复并合并 → `status: Resolved`（GitHub 自动转 `fixed`）
- [ ] 或承认风险 → `status: Dismissed`（GitHub 上 dismiss）
