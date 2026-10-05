# Contract: 阶段 C：`rxdb_change` 写入收口与生产权限

**落点**: `docker/sql/02-rxdb-sync-functions.sql`（触发器函数）、`docker/sql/04-rxdb-utils-functions.sql`（`rxdb_insert_changes`、
`rxdb_mutations` 写日志段）、新文件 `docker/sql/production/rxdb-change-grants.sql`；站点 `website/docs/adapters/supabase.md`。
**依据**: research D18。

## 1. 今天的权限

`01-rxdb-system-tables.sql` 对 `rxdb_change` `DISABLE ROW LEVEL SECURITY`，并 `GRANT ALL ON ALL TABLES / SEQUENCES IN SCHEMA public`
给 `anon`、`authenticated`。客户端可经 PostgREST 直接 `INSERT` / `UPDATE` / `DELETE` 日志表（故事症状 3）。

## 2. 函数改动（基础 SQL，开发与生产同一份）

| 函数                         | 改动                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb_log_change_trigger()`  | 加 `SECURITY DEFINER`；其余不变（`search_path` 已固定）。触发器函数不能被直接调用                                                                                                     |
| `rxdb_insert_changes(jsonb)` | 新，内部；`SECURITY DEFINER`、`SET search_path = pg_catalog, pg_temp`；写 `rxdb_change`（`ON CONFLICT ("clientId","localId") DO NOTHING`），返回 `{localId, remoteId}` 映射与新写条数 |
| `rxdb_mutations(...)`        | 写日志段改调 `rxdb_insert_changes`；调用前后设置 / 清除守卫                                                                                                                           |

守卫：

```sql
-- rxdb_mutations 内
PERFORM pg_catalog.set_config('rxdb.insert_changes', 'on', true);
v_log := public.rxdb_insert_changes(v_changes_to_write);
PERFORM pg_catalog.set_config('rxdb.insert_changes', '', true);

-- rxdb_insert_changes 入口
IF pg_catalog.current_setting('rxdb.insert_changes', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION USING ERRCODE = 'insufficient_privilege',
    MESSAGE = 'rxdb: rxdb_insert_changes may only be called by rxdb_mutations';
END IF;
PERFORM pg_catalog.set_config('rxdb.insert_changes', '', true);   -- 消费
```

`GRANT EXECUTE ON FUNCTION public.rxdb_insert_changes(jsonb) TO anon, authenticated`（INVOKER 的 `rxdb_mutations` 以调用方身份调它）。
客户端直调 → 守卫不是 `on` → 42501。PostgREST 不暴露 `pg_catalog.set_config`，客户端无法预置守卫。

阶段 B 的「写后记日志、只写 applied」规则（[rxdb-mutations-receipts.md](rxdb-mutations-receipts.md) §2 步骤 4）不变，只是落库者换成 helper。

## 3. 生产权限脚本（`docker/sql/production/rxdb-change-grants.sql`）

```sql
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_change FROM anon, authenticated;
REVOKE USAGE, UPDATE ON SEQUENCE public.rxdb_change_id_seq FROM anon, authenticated;
-- 保留 SELECT：rxdb_pull_changes（INVOKER）与 realtime 以调用方身份读日志
```

- `init-db.sh` 不自动加载；生产部署按站点文档手工执行（幂等，可重复跑）。
- 开发默认保持宽松：10 个 Supabase 测试文件以 `anon` 清理 `rxdb_change`，收紧会破坏它们（plan「偏离与澄清」5）。

## 4. 生效后的写路径

| 路径                                            | 生产权限下                 |
| ----------------------------------------------- | -------------------------- |
| 客户端 PostgREST 直接 `INSERT rxdb_change`      | 42501（AC#17）             |
| 客户端直调 `rxdb_insert_changes`                | 42501                      |
| 推送 `rxdb_mutations(p_skip_sync = true)`，main | 经 helper 写，配对校验先行 |
| 推送非 main 分支（只写日志）                    | 经 helper 写（AC#18）      |
| 直写 `mutations()`（`p_skip_sync = false`）     | 触发器（DEFINER）写        |

## 5. SQL 回归

用例 `production-change-grants`：在 `BEGIN … ROLLBACK` 内执行 §3 脚本，然后以 `authenticated`：

1. 直接 `INSERT INTO rxdb_change` → 42501（AC#17）；
2. 直调 `rxdb_insert_changes` → 42501；
3. `rxdb_mutations` 推一条非 main 分支日志 → 成功，日志新增 1 条（AC#18）；
4. `rxdb_mutations` 推一条 main 新建（显式日志）→ 成功，日志新增 1 条；
5. `rxdb_mutations(p_skip_sync = false)` 新建 → 成功，触发器写日志 1 条；
6. `SELECT` 日志表 → 成功。

连真实 Supabase 的分支同步回归（既有分支同步 spec）在执行生产脚本的环境下跑一遍，记录结果（AC#18）。

## 6. 站点文档（AC#19，`website/docs/adapters/supabase.md` 新增「生产部署」节）

- 生产环境的日志表权限：执行 §3 脚本；它做什么、为什么保留 `SELECT`。
- 业务表 RLS 推荐策略：SELECT / INSERT / UPDATE / DELETE 分开写；推送被拒的表现（阶段 A 整批 42501 / 阶段 B 逐实体被拒）。
- 已知限制：
  - 非 main 分支日志仍可经 `rxdb_mutations` 写入（不进 main 的拉取）；
  - `rxdb_branch` 仍对客户端开放；
  - 存在性探针 `rxdb_existing_ids` 的剩余探测面（同步表上任意 id 是否存在，见 006 existence-probe）；
  - 测试清理需改用 `service_role` 后开发默认才能收紧（后续项）。
