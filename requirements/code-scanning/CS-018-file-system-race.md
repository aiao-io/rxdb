---
id: CS-018
number: 18
status: Dismissed
rule: js/file-system-race
severity: warning
security_severity: high
path: website/scripts/flatten-api-docs.mjs
line: 82
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/18
---

# CS-018 Potential file system race condition

## 规则

- ID：`js/file-system-race`
- 名称：Potential file system race condition
- 描述：Potential file system race condition

## 位置

`website/scripts/flatten-api-docs.mjs:82`

## 告警

The file may have changed since it was checked.

## 修复方案

**不修 —— 串行构建流程，不存在并发写入方。**

告警指 [flatten-api-docs.mjs](../../website/scripts/flatten-api-docs.mjs) 的 `postProcessRootDocs`：先 `existsSync` 再 `readFile`。这个脚本是 `build-website` 里一步串行任务，读的是同一次构建刚生成的 typedoc 产物，同一时刻没有第二个进程在写这些文件。真出现竞态（比如手工并发跑两次构建），产物本身就已经错了，一句 try 也救不回来。

**GitHub 上关闭方式**：dismiss reason 选 `won't fix`，备注「构建期串行脚本，无并发写入方」。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
