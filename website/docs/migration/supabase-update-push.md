# Supabase UPDATE 与级联删除迁移

`@aiao/rxdb-adapter-supabase` 通过 `mutations()` 执行的批量修改使用普通 `UPDATE`，经 `rxdb_mutations.p_updates` 下发。
此前 US-220 已修复本地变更的推送路径；本次 US-223 将同一语义接到批量直写事务，并让 `mutations()` 返回服务器实际写入的行。
US-224 同时补齐推送父行删除后，由外键实际级联删除的子行日志。

**先在同一数据库事务中更新两份参考 SQL，再升级客户端。** 已安装系统表与幂等索引的数据库，本次按 02 → 04
更新 `docker/sql/02-rxdb-sync-functions.sql` 与 `docker/sql/04-rxdb-utils-functions.sql`，一起提交；`01-rxdb-system-tables.sql` 无变化。

## UPDATE 的变化

upsert（`INSERT … ON CONFLICT DO UPDATE`）先按 INSERT 求值。部分列载荷可能缺少必填列，INSERT 的
`WITH CHECK` 也可能比 UPDATE 策略更窄：owner 型策略下缺少作者列、共享编辑时修改别人创建的行，都会被误拒。
普通 UPDATE 只受 UPDATE 与 SELECT 策略约束。

| 路径                             | UPDATE 载荷                                                                                     | 返回结果                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 本地变更推送（US-220）           | `id`、变化的列与 `updatedBy`，未出现的列保持远端原值                                            | 推送结果与逐实体回执                                                                     |
| `mutations()` 批量直写（US-223） | 序列化整实体，`id` 用于定位，移除 `createdBy`，注入当前用户的 `updatedBy`，其余出现的列参与更新 | `UPDATE … RETURNING` 的实际行，与新增行一起由 `mutations()` 返回，供调用方读取服务器字段 |

直写没有逐列脏追踪，也不从实体缓存推导差异。新增仍经 `p_upserts` 执行 INSERT / upsert，新增时的作者注入语义不变。

普通单实体修改的 `save()` 经 `EntityManager.update` → `SupabaseRepository.update`，原本就通过 PostgREST 执行普通 UPDATE；
只有需要批量图变更时才走 `mutations()`。现有 `EntityManager.save` 丢弃批量 RPC 返回值并返回原实体，本次不修改该行为。
需要服务器最终行的调用方应读取 `mutations()` 的返回值，不能据此假定 `save()` 会自动合并服务器字段。

SQL 新增 `rxdb_batch_update_rows`（`SECURITY INVOKER`），仅直写通过它返回 UPDATE 行。
直写事务（`p_skip_sync = false`）的 `upserted` 数组同时包含新增和修改的服务器行；推送不返回修改行，
仍使用原 `rxdb_batch_update` 整数计数入口。`updated` 在两条路径都表示修改计数。

直写返回完整行需要相应列的 SELECT 权限，修改后的行也要满足 SELECT 策略。计数入口与推送保持不带 RETURNING 的
UPDATE，不因直写返回值需求追加全列 SELECT 或修改后行可见性要求；原有权限与 RLS 语义保持兼容。

某条 UPDATE 更新到零行时，不会插入残缺行把它复活：

| SQLSTATE | `details.reason` | 含义                                   |
| -------- | ---------------- | -------------------------------------- |
| `42501`  | `denied`         | 行仍存在，但调用方的行级权限不允许修改 |
| `RX001`  | `gone`           | 行已不存在                             |

直写 `mutations()` 将错误包装为 `SupabaseDataError`，同批新增、修改、删除全部回滚。推送启用回执时逐实体处理拒绝，
未启用时整批回滚；见[推送回执迁移](./supabase-push-receipts.md)。`details` 为 JSON 文本，包含
`op` / `schema` / `table` / `entityId` / `reason`。

## 级联删除的变化

过去 `p_skip_sync = true` 会跳过全部同步触发器日志；客户端只下发父删除时，外键级联删除的子行没有日志，
其他客户端拉取后留下幽灵子行。本次仍让显式变更使用客户端日志；触发器先捕获实际 DELETE，RPC 再将隐式日志
追加在源日志之后，统一写入。

- 未显式下发的子行各记一条 DELETE，完整 `OLD` 放入 `beforeData`，`afterData = null`、`snapshotComplete = true`。
- 隐式日志的 `clientId` / `localId` 为 NULL，推送父删除的客户端自己也能拉回子行删除。
- 同批显式删除的子行沿用客户端日志与 ID 映射，不重复追加隐式日志；显式删除与实际删除按 id 列类型的等值关系配对
  （与 DELETE 同一判据，uuid 大小写、`numeric` 的 `1` 与 `1.00` 认成同一行），并按分区根表归并。子行先被策略拒绝、随后由允许的父删除级联时，最终回执按实际结果记为 `applied`；
  最后一条显式 DELETE 的快照一律取实际删除的 `OLD`，客户端 DELETE 的 `inversePatch` 不含 `id`，不能替代。
- 同批新增或修改子行、再删父行时，源 INSERT / UPDATE 排在隐式 DELETE 之前，其他端拉取后不会把子行复活。
  RPC 保留日志数组顺序一次写入，全部日志与业务写一同提交或回滚。
- 成功批次重试沿用现有幂等键，跳过实体副作用，不会再次生成隐式删除日志。触发器模式（`p_skip_sync = false`）行为保持不变。

外键动作可删除调用方按业务表 RLS 看不到的子行。完整 `OLD` 日志沿用既有触发器模式的读取边界，可能包含子行全部列；
业务表 RLS 不会自动给变更日志提供逐行授权隔离。日志的授权与读取范围必须按应用的数据边界单独设计。

## 升级顺序

1. 确认数据库已安装原有系统表、`clientId + localId` 幂等索引与所用版本的推送回执前置；更早版本的迁移不能因本次无需重跑 01 而省略。
2. 在同一个数据库事务中依次执行两个函数脚本：

   ```bash
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
     -f docker/sql/02-rxdb-sync-functions.sql \
     -f docker/sql/04-rxdb-utils-functions.sql
   ```

   02 更新实际 DELETE 捕获，04 更新直写 UPDATE 返回行与删除日志统一写入，须使用同一版本并原子提交。两条独立的
   `psql` 命令会留下新触发器搭配旧 RPC 的中间窗口，窗口内的推送可能缺失级联日志。任一脚本失败时，上述命令回滚全部函数改动。

   使用 Supabase SQL Editor 时，把 `BEGIN;`、02 的完整内容、04 的完整内容和 `COMMIT;` 放在**同一次执行**中，
   不要分别提交两个文件。若部署工具无法在一个事务内执行两份脚本，须在维护窗口禁止业务写入，完成两份脚本后再恢复写入。
   现有业务表已挂载的通用同步触发器会使用新版函数。

3. 升级 `@aiao/rxdb-adapter-supabase` 客户端依赖。
4. 用应用的 RLS 角色核对 `mutations()` 返回值与数据库最终行，并验证父子级联删除、拉取闭环。

本次不新增系统表或列，不要求重跑 `01-rxdb-system-tables.sql`。若同时重跑包含广泛 GRANT 的旧基础脚本，仍须最后执行
`docker/sql/production/rxdb-change-grants.sql` 收紧日志写权限，见[生产部署](../adapters/supabase.md#生产部署)。

## 新旧版本组合

| 客户端 / SQL 组合         | 结果                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 旧客户端 + 新版 02 / 04   | 函数入口保持兼容；服务端修复隐式级联日志。旧客户端的直写仍按原方式构造 upsert，需升级客户端才能修复该路径        |
| 新客户端 + 本次之前的 SQL | 不支持该部署顺序；即使已有 `p_updates`，旧 SQL 仍缺少修改行返回或隐式级联日志，不能用 RPC 调用成功证明已完成升级 |
| 新客户端 + 新版 02 / 04   | 使用本文描述的 UPDATE 返回行与级联日志语义                                                                       |

更早、尚未支持 `p_updates` 的 SQL 可能报 `PGRST202` / `Could not find the function public.rxdb_mutations`。
当前客户端的错误码可从 `SupabaseDataError.code` 读取。升级对应 SQL 后再重试；失败的本地推送仍保留待推送变更。

## 参考

- [Supabase 适配器](../adapters/supabase.md)
- [Supabase 推送回执迁移](./supabase-push-receipts.md)
- [Supabase 传输失败错误类型迁移](./supabase-network-errors.md)
