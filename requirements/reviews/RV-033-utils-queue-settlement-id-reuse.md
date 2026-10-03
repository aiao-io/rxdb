---
id: RV-033
title: 队列任务 await 成功后同 ID 再入队复用了旧结果
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
---

# RV-033：队列任务 await 成功后同 ID 再入队复用了旧结果

**P2 · 确认问题，待修复**；业务实现未在本轮修改。

## 问题

```ts
const queue = new AsyncQueueExecutor(1);
let calls = 0;
const first = await queue.addTask(() => ++calls, 'same');
const second = await queue.addTask(() => ++calls, 'same');
```

实际 `first=1, second=1, calls=1`，第二个任务没有执行；按公开 TSDoc“结算后同 ID 可以再次入队”应为 `1,2,2`。

## 根因与源码证据

[AsyncQueueExecutor.addTask / runNext](../../packages/utils/src/async/AsyncQueueExecutor.ts) 在 `QueueItem.run` 内先 `resolve(await task())`，清理 queueMap/running 则放在另一层 `.finally()`。调用方 await 的继续执行可先于清理，Map 仍有旧的已 fulfilled Promise，新任务被错误去重。

## 动态复验

[复验 spec](../../packages/utils/src/__tests__/async/review-queue-settlement.spec.ts) 的完成后复用断言失败；同 ID 未结算并发去重、失败后重试两个对照路径通过，**1 failed / 2 passed**。见 [日志](evidence/2026-10-03/full-run/queue-settlement-probe.log)。另以 Node 原生 TS 直接执行同一类得到相同 `1,1,1`。

```bash
CI=true NX_DAEMON=false pnpm nx run utils:test --args='src/__tests__/async/review-queue-settlement.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

当前查到的 SQLite 客户端调用没有传去重 ID；**本轮没有把这个公用 API 缺陷扩大成已经复现 SQL 丢写**。

## 修复方案

统一任务结算与记账所有权，在向调用方兑现 Promise 前完成对应 ID/并发槽位清理；确保旧任务结束不会删除后续同 ID 的新条目。保留真实未结算请求的去重、clearQueue 取消与 waitForAll 契约。不能用调用方多 await 一个微任务掩盖问题。

## 解决记录

- [ ] 保留失败复验/门禁证据并定位最小修法。
- [ ] 修复后复跑关联回归，不用缓存或跳过换绿。
- [ ] 合并后按评审目录清理规则处理；当前仍 Open。
