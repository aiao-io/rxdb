---
id: RV-055
title: outbox 旧冲突修复覆盖快照之后的新离线写
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-055：outbox 旧冲突修复覆盖快照之后的新离线写

## 问题

**P2，确认问题，待修复。** QueryCache outbox 正在处理离线写 A，LWW 判 A 输给远端 R；获取 R 的完整行时响应被延迟。此时用户又离线写入 B，实际 SQLite 已保存 B，变更表产生第二条待推记录。旧修复响应交付后，`repairLocalCache` 把 R 写回 SQLite，覆盖了 B。

本轮不仅看到原生 SQLite 值错误：**公开 Repository.find 也返回 `remote-winner`，而不是 `offline-B`**。同时 `pendingQueryCacheWriteIds` 仍含该实体，待推计数仍为 1，不能从“队列没丢”推出“离线投影正确”。

第二条变更的 patch=B 仍然存在，水位只确认了 A；**没有证明变更日志永久丢失、B 已错误确认或服务端被回滚**。问题是新离线写的缓存投影被旧判决覆盖，用户眼前的状态与待推意图脱节。

## 根因

[query-cache-outbox.ts](../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts)：

1. `runOutboxFlush`（294–301）先取得 pending 快照与 maxChangeId，再构造条目；B 发生在该快照之后。
2. `settleEntry`（703–706）判 KEEP_REMOTE 时只将 entityId 放入 `restoreIds`，修复候选丢掉了原判决所针对的 change 边界。
3. `repairLocalCache`（850–861）等待远端行后直接 upsert/delete，没有在本地提交边界检查该实体是否又产生了新待推写。
4. 水位更新（343–348）仍只推进旧 maxChangeId，保护了 B 的队列，却保护不了已被覆盖的行。

SQLite 的单事务/串行队列不能解决这里的跨网络时间窗：B 的本地事务确实先提交，随后另一个合法缓存修复事务覆盖 B。原 `upsertMany` 正常提交并发送缓存事件，不是 Node IPC 或假 SQL 结果造成的。

## 实际复验

[复验 spec](../../apps/dev-rxdb-http-server/src/__tests__/review-outbox-repair-new-write.spec.ts) 使用 [完整链路 harness](../../apps/dev-rxdb-http-server/src/__tests__/fixtures/review-http-sqlite-harness.ts)：

- 原参考应用/PGlite 临时文件目录；原 HTTP 适配器与 native fetch；实际回环 HTTP。
- 原 Electron SQLite adapter/client/host 与临时 SQLite 文件，另一只 native `DatabaseSync` 只读连接直接核对已提交的行。
- 原 History/QueryCache/Sync 插件、实际触发器变更表、实际 LWW、实际 pending/watermark 查询。
- 延迟代理只保留已经由真实后端生成的响应；Electron IPC 管道为进程内直连，不是 GUI/安全隔离验证。离线状态通过 Reachability 输入明确控制，没有替换 REST Observable 或数据库行。

实际顺序：A(id=1) → 服务端更新 R → flush 判 A 输并请求 R → 响应等待时写 B(id=2) → 交付 R。真实时钟记录中 R 晚于 A、B 晚于 R；未用假 Date 构造冲突。

结果：`discarded=1`、`failures=[]`、`watermark=1`；id=2 的 patch 仍为 B，pending=1，但 native SQLite 和公开查询均为 R。顺序对照“先完成旧修复，再写 B”保持 B 和 pending=1。

**1 failed /1 passed**：[最终完整日志](evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [逐例 JUnit](evidence/2026-10-04/sync-http-sqlite/final-app-junit.xml) · [wire/SQL/队列观测](evidence/2026-10-04/sync-http-sqlite/final-observations.json)。整个应用最终 62 passed /5 failed，另四例属于 RV-052/053/054，不合并为本问题计数。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run dev-rxdb-http-server:test --args='src/__tests__/review-outbox-repair-new-write.spec.ts --run --coverage.enabled=false --maxWorkers=1' --skipRemoteCache --skipNxCache
```

## 最小修复方向与回归

修复候选要携带旧快照的 branch/repository/entityId/change 边界，在**实际本地提交点**验证是否存在该实体的快照后新待推写。检查与修复必须具有同一事务/条件提交保证；新写存在时保留其投影或重新计算修复，而不是先查再无条件 upsert。原水位只结算旧快照的保护应保留。

回归覆盖 KEEP_REMOTE restore、missing-remote drop、一次 flush 中多个实体、repair 失败/重试、branch 切换、修复提交前后新写、B 后续重放及公开离线读取。不要恢复 writer lease，不给整个数据库加无限等待锁，不用 fallback 吞掉新写与旧修复的冲突。

关联：Sync C5、QueryCache C3、sqlite-core C2；HTTP/桌面 adapter 与参考应用的集成边界。不是这些对象各自新增一条相同缺陷。

## 解决记录

- [x] 真实 HTTP/PGlite + 文件 SQLite 的失败复验、公开查询与顺序对照保留。
- [ ] 在本地提交边界保护快照后的新写，补 restore/drop 与多实体回归。
- [ ] 当前 Open，业务实现未改。
