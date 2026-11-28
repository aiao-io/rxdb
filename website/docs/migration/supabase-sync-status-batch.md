# Supabase 同步状态一轮问完

US-236 给同步状态统计加了两个只读函数，把「每个仓库各问一遍」改成「一轮问一次」：`rxdb_entity_sync_infos(p_entities)` 一次答完多个实体的登记信息，`rxdb_pending_change_counts(p_probes, p_branch_ids)` 一次数清多个仓库的待拉数。

此前打开一个带同步状态的页面、或者实时订阅恢复之后，客户端要为每个仓库各发三个请求：核对远端身份、问登记信息、数日志。统一频道加每个分区一个频道各报一次「订阅上了」，这样的一整轮还要再来一遍。dev-rxdb-supabase 的商品页打开时一共 113 个请求，升级之后是 11 个；点一次拉取（没有待拉）从 26 个降到 8 个加上每个可读分区 1 个。

## 变化

| 对象                                                                    | 变化                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb_entity_sync_infos(p_entities jsonb)`（02）                        | 新函数。`p_entities` 是 `[{"namespace", "entity"}]`，按传入顺序返回每一项的 `rxdb_entity_sync_info` 答案。`SECURITY INVOKER`：登记表照旧只经 `rxdb_entity_sync_info` 读                           |
| `rxdb_pending_change_counts(p_probes jsonb, p_branch_ids text[])`（02） | 新函数。每个探针数一个实体（分区实体细到一个区）在游标之后、给定分支上、不在 `excludeIds` 里的日志条数。`SECURITY INVOKER`：按 `rxdb_change` 的 RLS 数，anon 只数得到可读的分区，数不到未分区日志 |
| 生产权限脚本                                                            | 两个新函数收回 `PUBLIC`，授给 `anon`、`authenticated` 与 `service_role`                                                                                                                           |
| `@aiao/rxdb-plugin-sync`                                                | 状态统计一轮只核一次远端身份、各调一次上面两个函数；`pull()` 一轮只问一次登记信息；系统表不再进批量拉取，也不再为它们问远端（状态里照样列出，待拉恒为 0）                                         |
| `@aiao/rxdb-adapter-supabase`                                           | 实现两个批量方法；一次建出的一批 Realtime 频道都有了订阅结局才请求一次待拉数重算，之后单个频道重新加入时再单独请求                                                                                |

`excludeIds` 是客户端本地记着的、自己推上去的远端 id（推送回执写下的 `RxDBChange.remoteId`），随请求体发出，不受请求地址长度的限制。按区数的口径与逐个数（`getBucketChangeCount`）相同：分区此刻已被撤销时数出 0。

## 升级

### 1. 更新服务端 SQL

两个函数都在 02 里。随[日志同步迁移说明](./supabase-sync-access.md)那条升级命令执行（增量脚本 → 02 → 04 → 生产权限脚本，同一个事务）就会装上；只补这两个函数时，把 02 与生产权限脚本放进同一个事务：

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f docker/sql/02-rxdb-sync-functions.sql \
  -f path/to/your-caller-buckets.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

02 每次执行都会把 `rxdb_caller_buckets()` 恢复成平台默认，覆盖过它的部署把自己的覆盖放在生产权限脚本之前，见<a href="/docs/adapters/supabase#配置-caller-buckets">配置 caller buckets</a>。使用 Supabase SQL Editor 时，把 `BEGIN;`、几份文件的完整内容和 `COMMIT;` 放在**同一次执行**中。

旧客户端不调这两个函数，先升级 SQL 不影响它们。

### 2. 升级客户端

必须在第 1 步之后。新客户端的状态统计与拉取直接调这两个函数，连到旧版 SQL 时报 `Could not find the function public.rxdb_entity_sync_infos`（或 `rxdb_pending_change_counts`），错误码 `PGRST202`，同步面板与拉取停在原地，本地数据不动。

没有为它们留退路：PostgREST 的 schema cache 没刷新时同样回 `PGRST202`，那时服务端已经有分区实体，退回逐个问会把问题藏起来。部署之后仍报时，执行一次 `NOTIFY pgrst, 'reload schema';`。

自定义远端适配器不必改：`ScopedSyncAdapter.getEntitySyncInfos` 与 `PendingChangeCountAdapter.countPendingChanges` 都是可选的，没实现时同步插件逐个问，最多同时问 4 个，结果相同。

## 验证

以一个登录用户执行，答案按入参顺序一一对应：

```sql
SELECT public.rxdb_entity_sync_infos('[{"namespace":"public","entity":"Todo"}]');
-- [{"entity": "Todo", "bucketed": false, "namespace": "public", "tableName": "todos"}]

SELECT public.rxdb_pending_change_counts(
  '[{"namespace":"public","entity":"Todo","bucket":null,"afterId":0,"excludeIds":[]}]',
  ARRAY['main']
);
-- [<main 分支上 Todo 的未分区日志条数>]
```

客户端一侧：打开带同步状态的页面，网络面板里状态统计只剩 `rxdb_backend_id`、`rxdb_entity_sync_infos`、`rxdb_caller_buckets`（有分区实体时）与 `rxdb_pending_change_counts` 各一个，不随仓库数增加。
