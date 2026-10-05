---
id: RV-067
title: oo1 客户端模块迟到后重新激活已关闭连接
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-067：oo1 客户端模块迟到后重新激活已关闭连接

## 问题与影响

**P2，当前源码/复验确认，待修。** 公开 init 等待 loadModule 时 disconnect 尚无 db 可关，并清掉 init 状态；模块返回后初始化链照常 new DB、装 PRAGMA/hook、发布 ready。已完成关闭的实例被迟到初始化重新激活。与外层 factory 关闭是独立等待段，不能只修其中一层。

## 根因与锚点

[实际源码](../../packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts)：113–139、180–215、265–305。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/local-adapters/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

原 Oo1ClientBase + 实际生命周期、模块 Promise gate与明确 DB 接缝；迟到 db.close 期望1、实际0。测试先失败在清理计数，后续关闭后 execute 拒绝判据尚未到达，不能把后半断言写成已实际失败。未执行真实 sqlite/SQLiteAI 模块下载与持久锁。

[复验入口](../../packages/rxdb-adapter-sqlite-core/src/__tests__/review-parallel-oo1-init-close.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/local-adapters-tests.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

给 module load、DB 取得和状态发布统一关闭屏障，迟到 DB 仍要清理；验证 init/disconnect/reinit 归属、失败加载、重复关闭、清理异常。保留不同子后端已有关闭保护，不加 fallback。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
