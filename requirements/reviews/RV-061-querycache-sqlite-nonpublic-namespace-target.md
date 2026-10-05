---
id: RV-061
title: SQLite QueryCache 目标解析把非 public 实体当成裸表名
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: b7edef590051c8842d4914e30e31475977dea6ac
---

# RV-061：SQLite QueryCache 目标解析把非 public 实体当成裸表名

## 问题与影响

**P2，确认，待修。** 实体 User 位于 `shop` namespace，真实本地表为 `shop$user`。配置通过实例 syncOverrides 仅给 User 开启 QueryCache。远端普通仓储、metadata 与 findByIds 都可返回 2 行；冷缓存的公开 findAll 却执行 `INSERT INTO "User" ...` 并报 `no such table: User`。

同一份远端行调用既有物理表写入原语后，本地 User 仓储正常读回 2 行。表已经创建、引擎能写入、服务可达，错误在逻辑实体身份到物理表的解析，不是测试环境缺表。

本轮只确认单一非 public scope 的失败；没有实测两个同名 namespace 间的污染/越权，也没有据静态代码宣称所有后端都受影响。

## 根因

[RxDBAdapterSqliteBase](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 的 `#resolveQueryCacheTarget`（1437–1458）把 namespace 固定为 public；找不到 metadata 时把传入名字直接当物理表名。普通 public 实体的映射修复并未覆盖 `shop.User`。

[Repository 的 QueryCache session](../../packages/rxdb/src/repository/Repository.ts) 与 [引擎会话](../../packages/rxdb-plugin-querycache/src/query-cache-engine.factory.ts) 向 [QueryCacheEngine](../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 传逻辑实体名；本轮实际落库参数为 User，不能从裸名和硬编码 public 找到其 shop 元数据。缓存引用刷新和 delete 的 EntityType 查找也有固定 public 的调用点（1404–1406、1185）。

## 实际复验与边界

[真实冷缓存和物理表对照](../../packages/rxdb-adapter-supabase/src/__tests__/review-querycache-relations.spec.ts)：

- 实际创建所有 shop 表，普通本地仓储查询不报错且初始为空；远端相同主键条件有 2 行。
- `entityManager.getRepository(User).findAll(...)` 标量冷查询报 `no such table: User`，失败保留。
- 以 `sqliteGetTableNameByMetadata(getEntityMetadata(User))` 得到的 shop$user 调用既有 upsertMany，同一份原 SDK 远端行实际落库，本地读回全部主键。

[最终聚焦日志](evidence/2026-10-05/supabase/supabase-delivery-focused.txt) / [最终整包日志](evidence/2026-10-05/supabase/supabase-delivery-all-tests.txt)。宿主是 Chromium、原 wa-sqlite MemoryAsyncVFS/async/no-worker 及原 sqlite-core；没有冒充 Electron/Tauri、OPFS 崩溃恢复或 PGlite 实测。

## 修复方向

统一 QueryCache 与各 local/remote 原语消费的带 namespace 实体身份，沿元数据解析到实际表名/列名；upsert、metadata、delete、实体引用刷新和失效必须用同一身份。不要只在本次 INSERT 的 SQL 前临时拼 shop 前缀。

保持 public 已有行为、列别名/关系列和既有直接物理表调用兼容。补单一非 public、自定义表名/列名、两个同名不同 namespace、更新/删除/失效后的实体缓存一致性及其它真实宿主回归；本轮不以猜测报告跨 scope 数据污染。

## 解决记录

- [x] 非 public 冷缓存失败、真实物理表写入和本地主键集合对照。
- [ ] 统一 namespace 身份协议，补三类原语和引用缓存的回归。
