---
id: RV-063
title: LifecycleScope 在 setup 内关闭后遗失新资源 disposer
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-063：LifecycleScope 在 setup 内关闭后遗失新资源 disposer

## 问题与影响

**P2，当前源码/复验确认，待修。** acquire 在 setup 前检查 active；setup 的同步回调关闭 scope、关闭任务已快照并清空登记，随后 setup 返回 disposer，又无条件登记到已失活 scope。重复 dispose 复用旧任务，新 disposer 不会再执行。

## 根因与锚点

[实际源码](../../packages/utils/src/lifecycle/lifecycle-scope.ts)：101–106、176–200、238–241。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/core/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

公开 acquire/dispose 的同步重入，原 LifecycleScope 与 disposer spy；原正常登记/重复关闭对照，不涉及 OS 句柄。新增断言确认 disposer 未执行，不能扩大为已测全部框架/宿主泄漏。

[复验入口](../../packages/utils/src/__tests__/lifecycle/review-parallel-acquire-close.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

让 setup 返回后的资源所有权参与关闭协议：迟到 disposer 必须由关闭接管或立即清理并明确拒绝；只补 active 检查而丢 disposer 不够，不重复执行 setup。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
