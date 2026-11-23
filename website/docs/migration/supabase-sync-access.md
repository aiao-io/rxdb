# Supabase 日志同步只对已登录身份开放

本文记录 US-225 的旧协议权限迁移，重点是未分区 `rxdb_change` 日志、通用拉取、推送、分支登记和实时通知。当前按授权分区的只读同步见[Supabase 适配器文档](../adapters/supabase.md#按授权分区的只读同步)。分区实体部署新版 SQL 后，anon 可以通过按区只读 RPC 读取授权的 `public` 区，authenticated 可以读取 `rxdb_caller_buckets()` 返回的分区。

`@aiao/rxdb-adapter-supabase` 的参考 SQL 收紧了变更日志的访问。旧版本里：

- 生产权限脚本保留了 `GRANT SELECT ON public.rxdb_change TO anon, authenticated`，日志表本身也没开 RLS。anon key 随前端发布，拿着它就能读到日志全文，包括每一行的 `beforeData` / `afterData`。
- 适配器订阅日志表的 `postgres_changes`，每条变更连同 `patch` 推给所有订阅者。
- `rxdb_enable_sync_for_branch` 授给了 anon / authenticated，`rxdb_branch` 对客户端可直写；推送非 main 分支只写日志、不经业务表 RLS。任何人都能往别人的分支写入变更，分支主人拉取后照单物化。
- `rxdb_existing_ids` 关闭了行级安全、对 anon 开放，能跨租户判断某个主键是否存在。

## 变化

| 方面           | 之前                                         | 现在                                                                                                                                                        |
| -------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| anon           | 能拉取、推送、登记分支、调用探针，能读日志表 | 只能连接（`rxdb_server_version` / `rxdb_backend_id` / `rxdb_check_rls`）与按业务表 RLS 直接读写                                                             |
| 未分区日志读取 | anon 与 authenticated                        | 只有 authenticated                                                                                                                                          |
| 分区只读 RPC   | 未提供                                       | anon 读取 `public`，authenticated 读取 caller buckets                                                                                                       |
| 非 main 分支   | 谁都能写                                     | 首个登记或推送的已登录用户认领，之后只有所有者能写                                                                                                          |
| 实时通知       | 日志表的 `postgres_changes`，带完整行        | 未分区旧日志广播到 `rxdb:changes`，分区日志广播到 `rxdb:changes:bucket:<bucket>`，只带元数据；旧日志只对 authenticated 开放，分区频道按 caller buckets 开放 |
| Remote 事件    | `data` 是 `{ id, ...patch }`                 | `data` 只有 `{ id }`                                                                                                                                        |

未分区旧日志仍对全部登录者可读，日志同步只适用于这些旧数据对所有登录者可见的场景。分区实体的日志读取与实时通知范围由 `rxdb_caller_buckets()` 与业务表 RLS 决定，过滤条件只能在已授权分区内缩小范围。开放注册或开启匿名登录的部署，仍应按[适用边界](../adapters/supabase.md#适用边界)检查数据暴露范围。

## 升级

先让应用以已登录身份同步，再更新服务端 SQL，最后升级客户端。

### 1. 应用改用已登录的客户端

只给 `supabaseUrl` + `supabaseKey` 时，适配器自建的客户端没有会话，升级 SQL 之后拉取与推送都会得到 `42501`。把应用里已经登录的客户端交给适配器：

```ts
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, anonKey);
// …应用在这里完成登录；没有登录流程的公开演示可以 await supabase.auth.signInAnonymously()

rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: supabase }));
```

匿名登录要先在项目里打开：托管项目在 Authentication → Sign In / Providers 里开启 Anonymous Sign-Ins，自建栈设 `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true`。

### 2. 更新服务端 SQL

四份文件在同一个事务里按顺序执行，任一步失败整批回滚，库停在升级前的状态；整批可以重复执行：

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f docker/sql/production/rxdb-sync-access-upgrade.sql \
  -f docker/sql/02-rxdb-sync-functions.sql \
  -f docker/sql/04-rxdb-utils-functions.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

- 增量脚本补上分区同步所需的 `rxdb_change.bucket`、游标索引、`rxdb_sync_entity` 与分支所有者表 `rxdb_branch_owner`，并把 `rxdb_change` 移出 `supabase_realtime` 发布。它不清理日志：升级时还没有实体登记为分区实体，已有日志都是未分区旧日志；
- 02 加分支认领函数 `rxdb_claim_branch` 与通知触发器 `rxdb_change_broadcast`，分支登记开始校验所有者；
- 04 让推送在写非 main 日志前校验分支所有者；
- 生产权限脚本收回 anon 的协议入口与客户端对分支表的直写，并在 `realtime.messages` 上建接收策略。它必须最后执行。

四份文件只改 RxDB 自己的表、函数、触发器与通知策略，业务表的权限保持原样。不要重跑整份 `01-rxdb-system-tables.sql`：它末尾给开发与测试库用的 `GRANT ALL ON ALL TABLES IN SCHEMA public` 会把 public 下业务表的权限一并放宽给 `anon` / `authenticated`，生产权限脚本只收回 RxDB 自己的对象，放宽的业务表权限不会被收回。

`ON_ERROR_STOP` 只让 psql 遇错停下，不会撤销此前已经提交的语句，所以要加 `--single-transaction`。使用 Supabase SQL Editor 时，把 `BEGIN;`、四份文件的完整内容和 `COMMIT;` 放在**同一次执行**中，不要分开提交。

通知触发器调用 `realtime.send`，库里要有 Supabase Realtime 建的 `realtime` schema；缺少 `realtime.messages` 时生产权限脚本报错，整批回滚。

### 3. 为旧分支补登所有者

已有日志或登记、却没有所有者的非 main 分支一律拒绝写入，报 `rxdb: branch <id> has no owner`。先列出这些分支。推送会顺带上行从未单独登记的祖先分支，它们只出现在日志里，不在 `rxdb_branch` 中，所以两处都要查：

```sql
SELECT branch."branchId"
FROM (
  SELECT id AS "branchId" FROM public.rxdb_branch
  UNION
  SELECT "branchId" FROM public.rxdb_change
) AS branch
WHERE branch."branchId" <> 'main'
  AND NOT EXISTS (
    SELECT 1 FROM public.rxdb_branch_owner AS owner WHERE owner."branchId" = branch."branchId"
  );
```

核实每个仍在使用的分支属于哪个用户，再以管理员身份按分支 ID 补登：

```sql
INSERT INTO public.rxdb_branch_owner ("branchId", "ownerId")
VALUES ('feature-checkout', '00000000-0000-0000-0000-000000000000')  -- 换成该分支用户的 auth.users.id
ON CONFLICT ("branchId") DO NOTHING;
```

补登之后只有这个用户能继续登记、推送该分支。不再使用的旧分支不用处理。

### 4. 升级客户端

新客户端按未分区日志或已授权 bucket 订阅对应的私有频道；没登录（令牌是 anon key）时不订阅，登录后再调一次 `rxdb.connect('supabase')` 开启。旧客户端在 SQL 升级后收不到实时通知（日志表已不在发布里）；只要还没有实体改成分区实体（见下一节），拉取与推送不受影响，可以按自己的节奏升级。

新客户端要用新版 SQL 的按区函数，必须在第 2 步之后升级：先升级客户端，拉取会报 `Could not find the function public.rxdb_entity_sync_info`。

自定义代码若读过 Remote 事件的 `data` 字段，改成按 `id` 自己拉取：通知不再带行内容。

## 把实体改成分区实体

按[声明业务表分区](../adapters/supabase.md#声明业务表分区)给业务表加 `rxdb_bucket` 生成列，再调 `rxdb_enable_sync_for_table` 登记。在此之前：

- **先把所有客户端升级到新版本。** 分区日志只带元数据，RLS 按 caller buckets 放行。旧客户端的通用拉取直接读日志表，会拉到不带正文的分区日志；检查更新数到的条数也拉不完，一直显示有更新。新客户端对分区实体改走按区快照与增量，通用拉取与计数只看未分区日志。
- **登记会删掉这个实体全部的未分区历史日志。** 这些旧日志带完整正文，登记之前仍按旧口径对 authenticated 可读；登记之后客户端从业务表按调用者身份重建快照，正文只由业务表的 RLS 裁决。
