---
id: RV-054
title: 共享 SWR 失败回源被后续消费者记成已校验
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-054：共享 SWR 失败回源被后续消费者记成已校验

## 问题

**P2，确认问题，待修复。** 两个相同 where、不同 limit 的 SWR 查询共用一次远端元数据请求，该请求返回 401。第一消费者知道失败，第二消费者却把共享流的正常 complete 当成“远端校验成功”，写入 sync memo。紧接着第三个分页查询跳过远端，继续返回缓存。

默认 memo 窗口为 **1,000 ms**，不是永久不重试；配置更长 staleTime 时相应扩大错误抑制窗口。已有缓存时 SWR 先返回本地结果本身是既有契约，本报告**不要求取消 SWR，也不把先返回缓存本身列为缺陷**。

## 根因

[query-cache-sync-memo.ts](../../packages/rxdb-plugin-querycache/src/query-cache-sync-memo.ts) 的 `queryCacheFingerprint`（52–57）只包含 where/读模式，分页共享同步是有意设计。

[QueryCacheEngine.find](../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts)（222–228）命中在飞指纹时直接返回首个查询的共享 Observable；它携带的 `options.onRemoteError` 仍是首个消费者的回调。`#executeSWRQuery`（478–483）在已有缓存时回调首消费者并用 EMPTY 正常结束。

[query-cache-primary.ts](../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 的 `#runSync`（370–387）却为每个消费者建立独立 `remoteFailed`。第二个回调没有接到共享查询上，保持 false；其 complete 调用 `onValidated()`，将一次失败回源记成新鲜。共享工作去重了，成功/失败状态没有共享。

## 实际复验

[复验 spec](../../packages/rxdb-plugin-querycache/src/__tests__/review-swr-dedup-failure-memo.spec.ts) 经真实 RxDB/公开 Repository/QueryManager/插件工厂/primary/memo 执行。[harness](../../packages/rxdb-plugin-querycache/src/__tests__/fixtures/review-querycache-harness.ts) 的内存行仓储与远端 Observable 是接缝，实际 Chromium 宿主不等于实际 HTTP/Supabase 服务。

- 两个查询 limit=1/2、相同 where：先都拿到本地缓存，远端只请求一次；受控返回 401，随后 limit=3 查询应产生第二次元数据请求，实际仍只有一次。
- 单消费者失败对照：下一分页查询产生第二次远端请求，正常通过。
- 共享回源成功对照：下一分页复用 memo、保持一次远端请求，正常通过。

**1 failed /2 passed**：[聚焦日志](evidence/2026-10-04/sync-querycache/querycache-probes-repaired.txt)。最终整包仍只有本例及 [RV-053](RV-053-querycache-late-pull-overwrites-confirmed-write.md) 两例失败，总计 **3 failed /200 passed、无 skip**：[最终日志](evidence/2026-10-04/sync-querycache/final-all-tests.txt) · [JUnit](evidence/2026-10-04/sync-querycache/rxdb-plugin-querycache-final-junit.xml)。各例均销毁真实 RxDB，memo 定时器不留给后续测试。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-querycache:test --args='src/__tests__/review-swr-dedup-failure-memo.spec.ts --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向与回归

把“是否完成远端校验”作为共享同步结果/状态的一部分，每个消费者都根据同一个结算结果决定 remember；或明确对同一指纹的每个消费者广播失败。不要只给首个消费者保存回调，也不要把回调函数身份塞进指纹、以破坏分页去重来回避问题。

回归覆盖不同分页/排序的并发消费者、晚加入消费者、网络错误与业务拒绝、无缓存、回源成功、失效代次变化和窗口到期后重试。`onSyncStats` 等每消费者通知可在同一共享协议下检查，但本轮没有将其丢通知扩写成另一个已确认缺陷。

关联：QueryCache C1/C2；公开分页仓储。本轮没有验收应用分页 UI 或外部服务。

## 解决记录

- [x] 保留共享失败复验、单消费者失败对照和共享成功对照。
- [ ] 共享同步结算状态，补并发与 late subscriber 回归。
- [ ] 当前 Open，业务实现未改。

## 2026-10-04 真实 HTTP/SQLite 补证

[实际 401 的共享 SWR spec](../../apps/dev-rxdb-http-server/src/__tests__/review-swr-http-failure-memo.spec.ts) 使用原参考应用与 HTTP adapter，SQLite 文件中有缓存；原 Reachability report 是请求结算信号，观测器始终执行原方法。两消费者共享 401 后第三分页在 500ms 内仍只有一次 metadata 请求；单消费者失败产生第二次请求，共享成功保持一次。**1 failed /2 passed**。

正常对照最初在新请求尚未到达服务端时提前计数，已改等待 wire，不以早期对照假失败扩写缺陷：[初次日志](evidence/2026-10-04/sync-http-sqlite/swr-real-http-probe.txt)。[最终日志](evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) / [实际请求观测](evidence/2026-10-04/sync-http-sqlite/final-observations.json) 保留真实 401→原回调→memo 的链路。

**配置边界：**测试客户端使用默认 1000ms memo；仓库 [Recipe](../../modules/recipes-domain/src/recipe-entity.ts) 显式 syncStaleTime=0，该示例不触发此记忆窗口缺陷。此补证证明库支持的默认配置，不声称现有 HTTP UI 页面必然复现。业务未改，仍 Open。
