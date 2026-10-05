# Supabase 修改推送语义迁移

`@aiao/rxdb-adapter-supabase` 推送**本地修改**的落库方式变了：过去和新增一样走 upsert（`INSERT … ON CONFLICT DO UPDATE`），现在走普通 `UPDATE`，经 `rxdb_mutations` 的新参数 `p_updates` 下发。

这次变更同时改了客户端与参考 SQL（`docker/sql/04-rxdb-utils-functions.sql`），**必须先升级 SQL，再升级客户端**。

## 为什么改

修改的载荷只含变化的列。走 upsert 时 PostgreSQL 先按 INSERT 求值：

- 缺了 `NOT NULL` 列（如只改 `completed`，没带 `title`）→ 违反非空约束，整批失败；
- INSERT 策略的 `WITH CHECK` 也要过一遍 → owner 型策略下必须带上 `owner` 列，共享编辑的表上改别人创建的行直接被拒。

普通 `UPDATE` 只改出现的列，只受 UPDATE 与 SELECT 策略约束，这两类失败都消失。

## 行为变化

| 场景                             | 变更前                                    | 变更后                                         |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| 只改部分列                       | 缺 `NOT NULL` 列时失败                    | 只改出现的列，其余列保持原值                   |
| owner 型策略，载荷不含 `owner`   | INSERT 策略拒绝                           | 成功                                           |
| 修改他人创建的行（策略允许共享） | INSERT 策略拒绝                           | 成功                                           |
| 修改被行级权限拒绝（行仍存在）   | 以 upsert 的错误失败                      | `42501`，`details.reason = "denied"`，整批回滚 |
| 修改的行已被删除                 | upsert 按 INSERT 插入残缺行，把它「复活」 | `RX001`，`details.reason = "gone"`，整批回滚   |
| 新增、删除                       | 不变                                      | 不变                                           |

两种失败在客户端都表现为 `SupabaseDataError`，推送失败、水位线不推进，本地变更仍待推送。`details` 是 JSON 文本，键为 `op` / `schema` / `table` / `entityId` / `reason`，见 [Supabase 适配器](../adapters/supabase.md#修改的语义)。

## 升级顺序

1. 在 Supabase 数据库执行新版 `docker/sql/04-rxdb-utils-functions.sql`。它会删除旧的 4 参数 `rxdb_mutations`，新建 5 参数版本（`p_updates jsonb DEFAULT '[]'`），并新增 `rxdb_batch_update`、`rxdb_existing_ids`、`rxdb_id_array_type`。
2. 升级客户端依赖 `@aiao/rxdb-adapter-supabase`。

## 新旧版本组合

| 客户端 | 远端 SQL | 结果                                                                          |
| ------ | -------- | ----------------------------------------------------------------------------- |
| 旧     | 旧       | 变更前的行为                                                                  |
| 旧     | 新       | 不传 `p_updates`，取默认值；修改仍走 upsert，与变更前一致（缺陷仍在，不更坏） |
| 新     | 旧       | 推送失败，见下节；本地变更仍待推送，升级 SQL 后下一次推送即恢复               |
| 新     | 新       | 本文描述的新语义                                                              |

## 新客户端连旧 SQL 的报错特征

推送抛 `SupabaseDataError`，消息形如：

```
Failed to merge changes: Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_skip_sync, p_updates, p_upserts) in the schema cache
```

对应的 HTTP 响应是 404，响应体 `code` 为 `PGRST202`；`SupabaseDataError` 的消息里不带这个码，按消息中的 `Could not find the function public.rxdb_mutations` 识别即可。推送水位线不推进，本地变更不会丢失。执行新版 SQL 后无需任何客户端操作，下一次推送会把积压的变更一并推上去。

## 参考

- [Supabase 适配器](../adapters/supabase.md)
- [Supabase 传输失败错误类型迁移](./supabase-network-errors.md)
