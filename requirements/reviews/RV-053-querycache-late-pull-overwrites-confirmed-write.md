---
id: RV-053
title: QueryCache 迟到旧查询覆盖已确认写或复活已删缓存行
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-053：QueryCache 迟到旧查询覆盖已确认写或复活已删缓存行

## 问题

**P2，确认问题，待修复。** 在 QueryCache 查询已经获取旧行快照、响应尚未交付时，对同一实体的在线 update/remove 已在远端与本地确认完成。旧响应随后落地：update 的新值被本地旧值覆盖；remove 的已删行重新写进本地缓存。远端仍保持正确的新值/删除状态，本地投影却回退。

本次是有界读写竞争及可恢复缓存一致性缺陷，**没有证明服务器写被回滚、永久数据丢失或离线 outbox 被清空**。

**最新范围限定：**真实 SQLite 在线可通过后续查询收敛，不外推“在线最终必然回滚”；写确认后服务中断、旧响应仍交付时，已确认原生 SQLite 与公开离线读取都回到旧状态。详见本文真实后端复核。

## 根因

[query-cache-primary.ts](../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 的 update（217–224）和 remove（234–240）在写完成后只 `syncMemo.clear()`，不推进引擎的查询落地代次。

[QueryCacheEngine.ts](../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 将 memo generation 与 `#invalidationGeneration` 分开，后者只在 `invalidateInflight`（285–287）推进。`#pull`（747–754）因此仍判定写之前启动的响应属于当前代次，并调用 `localAdapter.upsertMany`。

源码 162–166 的说明假定“本仓储写过远端，飞行中的查询问到的就是写后状态”。复验推翻的是这项时序假设：查询完全可以先读旧快照，网络响应在后续写确认之后才到达。核心 [Repository](../../packages/rxdb/src/repository/Repository.ts) 的 update/remove 路径（423–440）没有补上本地写失效；远端 invalidation 事件（488–498）才有显式引擎失效。

## 实际复验

[复验 spec](../../packages/rxdb-plugin-querycache/src/__tests__/review-inflight-write-regression.spec.ts) 经真实 `RxDB → EntityManager.getRepository → Repository/QueryManager → 工厂/primary → QueryCacheEngine` 调用，**不是只 new 引擎的类测试**。[共享 harness](../../packages/rxdb-plugin-querycache/src/__tests__/fixtures/review-querycache-harness.ts) 将两侧行存储设为内存 Map，远端先取得独立旧快照，再用 Subject 控制交付；通过“读已开始”的 Promise 固定先后，不靠延迟睡眠碰运气。

- update：查询拿到 `remote-before-write`；写成功后两侧均为 `confirmed-new-write`；放行旧响应后远端仍新，本地变旧。
- remove：写确认后两侧均无 id=a；放行旧响应后远端仍无，本地重新出现 a。
- 顺序对照：先完成查询再 update，两侧均保持新值。

**2 failed /1 passed**：[聚焦日志](evidence/2026-10-04/sync-querycache/querycache-probes-repaired.txt)。最终 QueryCache 整包 **3 failed /200 passed**，另一个失败属于 [RV-054](RV-054-querycache-swr-dedup-failure-freshness.md)：[最终日志](evidence/2026-10-04/sync-querycache/final-all-tests.txt) · [JUnit](evidence/2026-10-04/sync-querycache/rxdb-plugin-querycache-final-junit.xml)。运行宿主是实际 Chromium，但本地不是 SQLite、远端不是 HTTP/Supabase，尚未验收这些后端的网络/事务调度。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-querycache:test --args='src/__tests__/review-inflight-write-regression.spec.ts --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向与回归

给写与查询落地建立同一套可判定先后的协议：例如在写开始时推进独立写纪元，旧查询提交须通过该纪元屏障；或对实体版本/CAS 验证后才允许 upsert。守卫应保护实际缓存提交点，不能只清“最近同步过”的计时器，也不能假定响应到达时间等于远端读取时间。

保持跨分页去重与正确的新代次查询，不把所有并发读一律吞掉或增加 fallback。回归补 create/删除后重建、离线写在 pending 快照之后发生、多个实体/多个 primary、写失败、缓存 SQL 排队与真实后端提交顺序。

关联：QueryCache C2/C3；核心 Repository 的失效协议；使用 QueryCache 的 HTTP/Supabase 应用。本轮没有运行真实服务，应用链路仍待补证。

## 解决记录

- [x] 保留公开仓储路径上的 update/remove 失败复验及顺序对照。
- [ ] 明确查询落地与写的并发协议，补真实后端回归。
- [ ] 当前 Open，业务实现未改。

## 2026-10-04 真实后端复核：限定在线/离线结论

[原服务/PGlite + 文件 SQLite spec](../../apps/dev-rxdb-http-server/src/__tests__/review-querycache-http-sqlite.spec.ts) 补充生产同款数据路径。原生只读连接观测到新值→旧值的已提交变化；但是在线时，缓存事件/QueryManager 的后续查询**可能修复**，通过一轮新查询也能重新收敛。初次在线即时观测在不同调度下有绿有红，不据此称所有在线请求最终永久回滚。

真实用户影响由两个 origin-down 复验确认：远端与 SQLite 写已完成、代理已保存旧 by-ids 响应；停止原参考服务，再交付旧响应。自动补查失败，SQLite 的新值被旧值替换/已删行复活，公开 offlineFallback 读取返回 Pasta #000。远端停止前的确认查询仍为新值/空数组。**2 failed /3 passed**，三个对照为两种在线新查询收敛及先读完再写。

[完整日志](evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [原生提交/网络观测](evidence/2026-10-04/sync-http-sqlite/final-observations.json) · [当轮台账](execution-2026-10-04-sync-http-sqlite.md)。原报告的 Map 接缝只证明未保护的旧提交，不能代替这些在线收敛条件；当前 P2/Open 保留，影响描述以上述真实网络中断窗口为准。Electron IPC 为进程内管道，GUI/CORS/OPFS 未测。
