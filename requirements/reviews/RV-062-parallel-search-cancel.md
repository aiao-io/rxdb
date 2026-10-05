---
id: RV-062
title: search 取消清空待执行请求却未结算 loadMore
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-062：search 取消清空待执行请求却未结算 loadMore

## 问题与影响

**P2，当前源码/复验确认，待修。** state$ 的 success 订阅同步调用 loadMore，随后 clear 或 destroy。已运行请求在 pumpRunning=true 的窗口中把分页等待者排入 pendingQuery；取消直接丢弃该结构，两个调用方 Promise 均未结算。

## 根因与锚点

[实际源码](../../packages/rxdb-plugin-search/src/core/search-handle.ts)：149–169、240–265。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/plugins/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

原公开 SearchHandle、真实微任务时序；搜索执行函数是显式注入的测试接缝。两个取消断言失败，未取消的同一重入位置成功，不以睡眠超时猜永久挂起。

[复验入口](../../packages/rxdb-plugin-search/src/__tests__/review-parallel-loadmore-settlement.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

集中结算/取消 pending request 后再释放所有权；保留已运行请求的 generation、AbortController、结果与错误语义。clear、destroy、重复调用、加载中与成功订阅重入都需回归。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
