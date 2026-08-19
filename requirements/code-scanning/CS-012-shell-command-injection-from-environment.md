---
id: CS-012
number: 12
status: Dismissed
rule: js/shell-command-injection-from-environment
severity: warning
security_severity: medium
path: website/scripts/build-website.mjs
line: 113
created: 2026-08-16
updated: 2026-08-20
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

**不修 —— 信任边界之外，所谓「污染源」是仓库自身的目录名。**

告警指 [build-website.mjs](../../website/scripts/build-website.mjs) 把 `getPackageNames()` 的结果拼进命令行。而 `getPackageNames()` 读的是 `packages/` 下的目录名 —— 要污染它，攻击者得先拿到本仓库的写权限；拿到写权限之后，直接改这个脚本本身远比构造恶意目录名省事。

同类风险的真实防线是分支保护与 CI 权限，不是这一行的转义。

**GitHub 上关闭方式**：dismiss reason 选 `won't fix`，备注「输入来自仓库内目录名，污染前提是仓库写权限」。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
