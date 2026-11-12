# Supabase 变更日志提交顺序修复

`@aiao/rxdb-adapter-supabase` 拉取远端变更时，以 `rxdb_change` 的自增 `id` 为游标，每次只取 `id` 大于上次位置的变更。
自增 `id` 在写入时分配、提交时才对其他会话可见。几个写日志的事务并发时，先拿到 `id` 的事务可能更晚提交：

1. 事务 A 写日志，拿到 `id = 100`，还没提交；
2. 事务 B 写日志，拿到 `id = 101`，立即提交；
3. 客户端 C 拉取，只看得见 101，游标推进到 101；
4. A 提交。C 之后每次都从 101 往后拉，`id = 100` 再也拉不到，也没有任何报错。

A 和 B 可以是两个客户端的推送，也可以是推送与直写业务表（同步触发器记日志）。

## 修复

参考 SQL 给 `rxdb_change` 挂了语句级触发器 `rxdb_change_serialize_append`。写日志的事务先取同一把事务级咨询锁，持有到提交。
写日志的事务因此逐个提交，后提交的变更一定拿到更大的 `id`。推送、同步触发器和任何直接写 `rxdb_change` 的路径都会经过这个触发器。

适配器同时把 SQLSTATE `40P01`（死锁）列为可重试的写入失败，推送被数据库中止时会自动重发。

## 升级

只需更新服务端 SQL，客户端不用升级，`01-rxdb-system-tables.sql` 也不用重跑：

- 部署里的 `02-rxdb-sync-functions.sql` 与 `04-rxdb-utils-functions.sql` 已经和仓库一致时（已完成 [Supabase 修改推送语义迁移](./supabase-update-push.md)），重新执行一次新版 `02`：

  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/02-rxdb-sync-functions.sql
  ```

- 还停在更早的版本时，按 [Supabase 修改推送语义迁移](./supabase-update-push.md)在同一事务里一起升级 02 和 04，触发器随新版 02 一并装上。不要只重跑 02。

装好后用下面的查询确认，返回一行即可：

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.rxdb_change'::regclass AND tgname = 'rxdb_change_serialize_append';
```

## 代价

从写第一条日志到提交这一段，写日志的事务要排队：

- 推送在业务写完成之后才写日志，排队的只是尾段，正常流量下察觉不到；
- 直写业务表的长事务（例如在 SQL 里批量改几十万行）会一直挡住推送。等待超过调用角色的 `statement_timeout`（Supabase 默认 `anon` 3 秒、`authenticated` 8 秒）时推送失败，下一轮同步重发。批量维护尽量拆成小事务，或放在维护窗口执行；
- 直写的多语句事务与推送改到同一行时可能互锁，PostgreSQL 检测到后中止其中一个（`40P01`）。被中止的是推送时，适配器自动重试；被中止的是你自己的事务时，按 PostgreSQL 的常规做法重试。

## 升级前已经漏掉的变更

触发器只保证之后的变更不再漏，已经漏掉的不会自动补回：客户端的游标已经越过了它们。
怀疑某个客户端漏过变更时，先确认它的本地变更都已推送，再删掉本地库重新同步，从头拉取一遍。
