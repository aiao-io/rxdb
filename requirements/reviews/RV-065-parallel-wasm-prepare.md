---
id: RV-065
title: sqlite-wasm prepare 后续语句失败时漏 finalize 已得句柄
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-065：sqlite-wasm prepare 后续语句失败时漏 finalize 已得句柄

## 问题与影响

**P2，当前源码/复验确认，待修。** bindings 分支以 unscoped=true 枚举并收集语句；后续 prepare 抛错时枚举尚未结束，未进入多语句拒绝清理或 runStatement 的 finally。上游 unscoped 明确把 finalize 责任交给调用方，外层 catch 只包装错误。

## 根因与锚点

[实际源码](../../packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts)：108–129、135–136。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/local-adapters/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

Chromium 中原 executeHelper + 显式 SQLiteAPI 句柄接缝；第二 prepare 失败后 finalize(41) 实际 0 次。871 条原/正常用例通过、1 条新红、13 skipped。没有把 mock 句柄计数冒充真实 SQLite busy、WASM 或持久化后果。

[复验入口](../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/review-parallel-statement-cleanup.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

让整个 prepare/收集/执行阶段受 finally 保护，回收所有已取得 unscoped 句柄；一个 finalize 失败不能跳过后续句柄，也不能遮蔽原 prepare 原因。保留绑定多语句拒绝契约。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
