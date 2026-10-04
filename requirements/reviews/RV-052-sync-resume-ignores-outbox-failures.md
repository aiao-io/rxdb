---
id: RV-052
title: 自动恢复忽略 outbox 结构化失败并宣布成功
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-052：自动恢复忽略 outbox 结构化失败并宣布成功

## 问题

**P2，确认问题，待修复。** QueryCache 自动回推中，REST 写被 403 拒绝或遭遇网络故障，outbox 保留未确认写和原水位，但同步状态仍调用 `reportSuccess()`、将 `lastError` 清成 null。用户看不到这轮失败原因；`pendingCount=1` 与“本轮成功”同时出现。

本次确认的是错误可观察性/成功判定失守，**不是水位误推进或待推数据已经丢失**。两种失败的水位保护在本次复验中仍然有效。

## 根因

[query-cache-outbox.ts](../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts) 的 `replayEntry`（798–805）把远端错误转换成 `QueryCacheOutboxResult.failures`，`runOutboxFlush`（332–340）在失败时返回结构化结果；Promise 不必 reject。

[sync-listeners.ts](../../packages/rxdb-plugin-sync/src/sync-listeners.ts) 的 `flushRepository`（99–106）只消费 `result.conflicts`，完全不检查 `failures`。`flushRepositories`（115–124）通过 `runQuietly` 把“未抛异常”当作成功，`resumeSync`（176–178）随后清账。这两个模块对失败契约的理解不一致。

原 `sync-listeners.spec.ts` 的错误用例把 flush mock 为 reject，只覆盖了异常通道，没有覆盖真实重放返回的失败数组。

## 实际复验

[复验 spec](../../packages/rxdb-plugin-sync/src/__tests__/review-resume-outbox-result.spec.ts) **不 mock `flushQueryCacheOutbox`**：原 outbox 重放、原监听器、原 `SyncStateHub` 和 `ReachabilityMonitor` 都实际执行。接缝是内存系统仓储、REST Observable 与脱离宿主的网络事件源；运行宿主是 Chromium，不是真实 HTTP/Supabase 服务或磁盘持久化测试。

- REST 403：先直接调用原 flush，确认 `failures=[{entityId:'a', error: Forbidden}]`、watermark=null；再触发自动恢复，同一写再次被拒，`pendingCount=1`、lastError=null，`reportSuccess` 被调用一次。
- 网络失败：`online=false`，水位未推进且 pending=1，但 lastError=null、仍调用 `reportSuccess`。
- 成功对照：远端写成功、水位推进到 1、pending=0，才允许清除旧错误。

**2 failed /1 passed，最终整包 2 failed /450 passed、无 skip**：[最终日志](evidence/2026-10-04/sync-querycache/final-all-tests.txt) · [JUnit](evidence/2026-10-04/sync-querycache/rxdb-plugin-sync-final-junit.xml)。取证先行日志见 [独立复验](evidence/2026-10-04/sync-querycache/sync-resume-outbox-initial.txt)。本轮后续将状态断言改为 soft，使“错误被清空”与“成功被调用”两个负向断言都实际执行。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-sync:test --args='src/__tests__/review-resume-outbox-result.spec.ts --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向与回归

成功判定必须消费结构化 `failures`，将实际错误上报给 `syncState`，并使该仓库结果参与整轮 `allSucceeded` 聚合。保留冲突上报与已经正确的水位保护；不要为了让外层 catch 看见失败而丢掉部分成功结果。

回归应覆盖 metadata probe 失败、REST 403/网络错误、多个仓库部分失败、失败与 KEEP_REMOTE 冲突并存，以及真正全成功后清账。`skipped` 的成功口径另行明确，不在本轮把全部 skip 擅自当成错误。

关联：Sync C1/C5；QueryCache C3；HTTP/Supabase 应用状态显示属于后续集成复验，不随此接缝测试验收。

## 解决记录

- [x] 保留真实重放返回值与自动恢复的失败复验及正常对照。
- [ ] 修复结果消费与整轮成功聚合，补多仓库回归。
- [ ] 当前 Open，业务实现未改。

## 2026-10-04 真实后端补证

[实际 HTTP 401 与文件 SQLite spec](../../apps/dev-rxdb-http-server/src/__tests__/review-auto-resume-http-failure.spec.ts) 使用原参考服务/PGlite、原 HttpResponseError 分类、原 SQLite 触发器/出站表和真实恢复监听器。metadata probe 由原鉴权返回 401，pending=1，但 lastError=null/reportSuccess=1；真实 PATCH 成功对照 pending=0。**1 failed /1 passed**。本轮 401 发生在 probe，不把它描述为原 403 写动词的实测。

[最终日志](evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [wire/状态观测](evidence/2026-10-04/sync-http-sqlite/final-observations.json) · [测量接缝与环境](execution-2026-10-04-sync-http-sqlite.md)。原业务代码未改，仍 Open；不依赖上一轮假 REST Observable 才能触发。
