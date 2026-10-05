---
id: RV-066
title: SQLite core disconnect 未接管在途 client factory
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-066：SQLite core disconnect 未接管在途 client factory

## 问题与影响

**P2，当前源码/复验确认，待修。** 原 base adapter 创建 client 的 Promise 未返回时 disconnect 读取当前空 client 并完成；工厂随后交付实例，连接链继续缓存它。此次已完成关闭没有回收迟到 client。子 client 自身的 init 守卫覆盖不到外层尚未拿到实例的工厂阶段。

## 根因与锚点

[实际源码](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)：581–592（connect）、599–622（disconnect）、1484–1512（#client 工厂与缓存）。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/local-adapters/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

真实 base adapter/公开 connect/disconnect + 工厂 Promise gate和最小合法client接缝；迟到 client.disconnect 计数期望1、实际0。核心整套1465通过、两条新红、21 skipped（另一条是独立 oo1 层问题）。没有冒充真实 Worker/IPC/文件锁后果。

[复验入口](../../packages/rxdb-adapter-sqlite-core/src/__tests__/review-parallel-init-disconnect.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/local-adapters-tests.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

串行或 epoch 化 factory 与关闭所有权，关闭等待或回收捕获的在途结果，禁止迟到实例重新发布；保留并发连接去重，回归工厂失败、重复关闭、重连和 Comlink ownership。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
