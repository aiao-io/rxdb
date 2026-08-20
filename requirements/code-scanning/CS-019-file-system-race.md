---
id: CS-019
number: 19
status: Dismissed
rule: js/file-system-race
severity: warning
security_severity: high
path: website/scripts/preview-with-redirects.mjs
line: 105
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/19
---

# CS-019 Potential file system race condition

## 规则

- ID：`js/file-system-race`
- 名称：Potential file system race condition
- 描述：Potential file system race condition

## 位置

`website/scripts/preview-with-redirects.mjs:105`

## 告警

The file may have changed since it was checked.

## 修复方案

**不修 —— 告警描述的风险已经被现有的 try/catch 覆盖。**

[preview-with-redirects.mjs](../../website/scripts/preview-with-redirects.mjs) 里那处 `readFile` 本来就整段包在 `try { … } catch { … }` 内，check 与 use 之间文件消失只会走到 catch，不会有未处理异常。CodeQL 的 `js/file-system-race` 只看 `existsSync` / `readFile` 的配对，看不到这一层。

对比 [CS-017](./CS-017-file-system-race.md)：那处**没有** try，所以必须修 —— 同一条规则、两种结论，差别就在这里。

**GitHub 上关闭方式**：dismiss reason 选 `false positive`，备注「读取已在 try/catch 内」。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
