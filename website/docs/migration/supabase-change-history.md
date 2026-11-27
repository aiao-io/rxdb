# Supabase 远端变更历史

US-229 在远端加了一张只记不同步的历史表 `rxdb_change_history`：登记了同步的业务表每次生效的写入记一条完整的前后快照、操作者与写入路径。读取只经 `rxdb_entity_history`，只对当前能编辑这一行的成员开放，正文按列权限脱敏。用法见 <a href="/docs/adapters/supabase#远端变更历史">Supabase 适配器的远端变更历史</a>。

同步日志 `rxdb_change` 的规则不变：分区日志仍不带正文，未分区日志与原来一致。已有客户端不升级也能照常同步；要读历史，升级到带 `getEntityHistory` 的 `@aiao/rxdb-adapter-supabase`。

## 变化

| 对象                                                          | 变化                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb_change_history` 与序列                                  | 新表，开 RLS 并 `FORCE`、不建策略；生产权限脚本收回客户端角色的全部权限                                                                                               |
| `rxdb_log_change_trigger`（02）                               | 直接写业务表时，在写日志的同一处记一条来源为 `trigger` 的历史                                                                                                         |
| `rxdb_insert_changes` / `rxdb_mutations`（04）                | 推送在 main 上落库的每条源日志记一条来源为 `push` 的历史；推送里删父行时由外键带走的子行记为 `cascade`。被拒、回滚的写入不记，非 main 分支只写日志，也不记            |
| `rxdb_entity_history`（04）                                   | 新读取 RPC，只授给 `authenticated`                                                                                                                                    |
| `rxdb_caller_can_edit` / `rxdb_caller_can_edit_default`（04） | 新判定函数，部署方覆盖前者；两者都不授给客户端角色                                                                                                                    |
| `rxdb_batch_upsert`（04）                                     | 只写业务表的非生成列。分区表的 `rxdb_bucket` 是生成列，推送本机新建的分区实体以前报 `428C9 cannot insert a non-DEFAULT value into column "rxdb_bucket"`，现在照常写入 |

历史只从升级那一刻开始记，升级之前的写入没有历史，也不会从 `rxdb_change` 补：分区日志本来就不带正文，补不出来。

## 升级

### 1. 更新服务端 SQL

与[日志同步只对已登录身份开放](/migration/supabase-sync-access.md#2-更新服务端-sql)同一条命令：四份文件在同一个事务里按顺序执行，任一步失败整批回滚，整批可以重复执行。

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f docker/sql/production/rxdb-sync-access-upgrade.sql \
  -f docker/sql/02-rxdb-sync-functions.sql \
  -f docker/sql/04-rxdb-utils-functions.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

- 增量脚本建历史表、索引并开 RLS（`CREATE TABLE IF NOT EXISTS`，已有的表与数据不动）；
- 02 让直写触发器记历史；
- 04 让推送记历史，装上读取 RPC、判定函数，并修正 `rxdb_batch_upsert` 的生成列；
- 生产权限脚本收回客户端对历史表与序列的权限，读取 RPC 只授给 `authenticated`，判定、脱敏与写入函数不授给任何客户端角色。它必须最后执行。

同样不要为此重跑整份 `01-rxdb-system-tables.sql`：它的整库授权会放宽业务表的权限，见[日志同步只对已登录身份开放](/migration/supabase-sync-access.md#2-更新服务端-sql)。使用 Supabase SQL Editor 时，把 `BEGIN;`、四份文件的完整内容和 `COMMIT;` 放在**同一次执行**中。

### 2. 覆盖编辑权限的判定

平台默认的判定：未分区实体看调用者角色对业务表有没有 `UPDATE` 权限；分区实体只认调用者自己的 `user:<auth.uid()>` 区，公开区与其他区默认谁都看不到历史。按租户、按团队等方式授权的部署，用 `CREATE OR REPLACE` 覆盖 `public.rxdb_caller_can_edit(p_namespace text, p_entity text, p_row jsonb)`，口径与业务表的 UPDATE 策略一致，示例见<a href="/docs/adapters/supabase#按自己的权限模型判定">按自己的权限模型判定</a>。

步骤 1 里的 04 每次执行都会把 `rxdb_caller_can_edit` 恢复成平台默认，02 同样会把 `rxdb_caller_buckets()` 恢复成平台默认（只有 `public` 与 `user:<auth.uid()>`）。所以每次执行完步骤 1，都要重新加载自己的这两个覆盖，再执行一次生产权限脚本：

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f path/to/your-caller-buckets.sql \
  -f path/to/your-caller-can-edit.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

`rxdb_caller_buckets()` 的覆盖影响面更大：同步拉取、业务表 RLS 与实时频道都按它放行。覆盖装回之前，客户端把租户区当成已撤销，清掉本机这些区的数据，装回之后再整块重拉，期间没有报错。按租户授权的部署最好把这两个覆盖直接放进步骤 1 的同一个事务、生产权限脚本之前，不留这段窗口。

覆盖加载之前，历史照常记录，读取按平台默认判定：分区实体只有调用者自己的 `user:<auth.uid()>` 区读得到，其余成员读到零条；未分区实体对有表级 `UPDATE` 权限的身份全部开放。业务表用 RLS 按行限制编辑（例如只能改自己创建的行）的，默认判定比 RLS 宽，要先加载覆盖再开放读取入口：这类表的正文本来就在对已登录身份可读的未分区日志里，历史多出来的是操作者与来源。

### 3. 升级客户端

`getEntityHistory` 是新增的方法，不改动已有接口。升级之后再在界面上开历史入口，入口只给能编辑这一行的身份：判否的条目服务端直接不返回，anon 调用得到 `SupabaseDataError`。

## 验证

以一个能编辑某行的已登录身份改一下这一行，再读它的历史，应该读到刚才的修改，`actor` 是这个身份的 `auth.uid()`：

```sql
SELECT id, type, source, actor, "createdAt"
FROM public.rxdb_entity_history('public', 'CatalogItem', '<行 id>');
```

在 SQL Editor 里以数据库属主身份执行时没有 JWT，读取 RPC 一律返回零条；验证要经已登录的客户端，或在会话里设置 `request.jwt.claims`。anon 与 authenticated 直接 `SELECT public.rxdb_change_history` 应得到 `42501 permission denied for table rxdb_change_history`。
