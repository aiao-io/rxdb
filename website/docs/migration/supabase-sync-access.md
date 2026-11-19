# Supabase 日志同步只对已登录身份开放

`@aiao/rxdb-adapter-supabase` 的参考 SQL 收紧了变更日志的访问。旧版本里：

- 生产权限脚本保留了 `GRANT SELECT ON public.rxdb_change TO anon, authenticated`，日志表本身也没开 RLS。anon key 随前端发布，拿着它就能读到日志全文，包括每一行的 `beforeData` / `afterData`。
- 适配器订阅日志表的 `postgres_changes`，每条变更连同 `patch` 推给所有订阅者。
- `rxdb_enable_sync_for_branch` 授给了 anon / authenticated，`rxdb_branch` 对客户端可直写；推送非 main 分支只写日志、不经业务表 RLS。任何人都能往别人的分支写入变更，分支主人拉取后照单物化。
- `rxdb_existing_ids` 关闭了行级安全、对 anon 开放，能跨租户判断某个主键是否存在。

## 变化

| 方面         | 之前                                         | 现在                                                                                            |
| ------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| anon         | 能拉取、推送、登记分支、调用探针，能读日志表 | 只能连接（`rxdb_server_version` / `rxdb_backend_id` / `rxdb_check_rls`）与按业务表 RLS 直接读写 |
| 日志读取     | anon 与 authenticated                        | 只有 authenticated                                                                              |
| 非 main 分支 | 谁都能写                                     | 首个登记或推送的已登录用户认领，之后只有所有者能写                                              |
| 实时通知     | 日志表的 `postgres_changes`，带完整行        | 私有频道 `rxdb:changes` 的广播，只带元数据，只对 authenticated 开放                             |
| Remote 事件  | `data` 是 `{ id, ...patch }`                 | `data` 只有 `{ id }`                                                                            |

日志仍对全部登录者可读：日志同步只适用于所有登录者可见范围一致的数据。开放注册或开启匿名登录的部署，等于把日志开放给任何访客，见[适用边界](../adapters/supabase.md#适用边界)。

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

- 增量脚本建分支所有者表 `rxdb_branch_owner`，把 `rxdb_change` 移出 `supabase_realtime` 发布；
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

新客户端订阅私有频道；没登录（令牌是 anon key）时不订阅，登录后再调一次 `rxdb.connect('supabase')` 开启。旧客户端在 SQL 升级后收不到实时通知（日志表已不在发布里），拉取与推送不受影响，可以按自己的节奏升级。

自定义代码若读过 Remote 事件的 `data` 字段，改成按 `id` 自己拉取：通知不再带行内容。
