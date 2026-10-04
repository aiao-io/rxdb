---
id: RV-038
title: 备份排队回调同步抛错后外层 Promise 永久挂起
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-038：备份排队回调同步抛错后外层 Promise 永久挂起

## 问题

🔴 **确认问题，待修复。** 公开导出的 `runRxDBBackupWhenQueued` 接受 `() => Promise<T>` 回调。一个符合类型、在返回 Promise 之前同步抛错的回调，会让调用方永远等不到 resolve/reject。队列已结束这一项，排队超时也已取消；再等更长时间不会得到结果。

## 根因与源码证据

[backup-queue.ts](../../packages/rxdb/src/backup/backup-queue.ts) 第 64–70 行先 `stopWaiting()`，再执行 `await task().then(resolve, reject)`。`task()` 同步抛错时根本没有执行 `.then`：内层队列 Promise 拒绝；尾部 `.catch` 进入 `giveUp`，而第 48 行因 `waiting === false` 直接返回。外层 Promise 没有任何后续结算路径。

该函数在 [核心公开入口](../../packages/rxdb/src/index.ts) 导出，也由 SQLite/PGlite 备份调用。**当前两个适配器传入的 snapshot 都是 async 函数，本轮未复现它们的常规备份挂起；已确认的是公开排队 helper 的合法回调边界，不宣称所有备份均失败。**

## 动态复验

[复验 spec](../../packages/rxdb/src/__tests__/backup/review-queue-sync-throw.spec.ts) 使用实际 `AsyncQueueExecutor` 和实际 helper，在 50ms 排队超时之后仍无法收到同步错误；100ms 观测返回 `unsettled`。Promise 异步拒绝和正常 resolve 两个对照正常。

**1 failed / 2 passed**：[日志](evidence/2026-10-03/follow-up/backup-queue-sync-throw.txt)、[状态](evidence/2026-10-03/follow-up/backup-queue-sync-throw-status.json)。运行面为项目配置的 Chromium，不用测试替身替换排队实现；该观察窗口证明当前挂起，源码中的缺失结算路径证明并非单纯慢任务。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb:test --args='src/__tests__/backup/review-queue-sync-throw.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

在任务执行段统一捕获同步抛错与 Promise 拒绝，例如 `Promise.resolve().then(task).then(resolve, reject)`，或者显式 `try { resolve(await task()) } catch (error) { reject(error) }`。原始任务错误继续向外传播，不改成成功、空结果或排队取消错误。保留“只有排队阶段受 lockTimeout 控制”的契约，不用加执行超时来掩盖丢失结算。

补同步抛错、异步拒绝、正常结果和前一失败不阻塞后续任务的回归。

## 解决记录

- [x] 保留失败复验和两个对照；未修改业务实现。
- [ ] 修复 helper 的任务结算边界，复跑备份排队及适配器备份回归。
- [ ] 当前仍 Open。
