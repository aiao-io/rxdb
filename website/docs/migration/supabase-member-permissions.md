# Supabase 成员权限

US-234 在远端加了两个函数，说明调用者在各作用域上有哪些成员权限：`rxdb_caller_grants()` 一个作用域一行，`rxdb_caller_scopes(p_permission)` 列出带有某项权限的作用域键。业务表的写策略与远端变更历史的判定都可以经它们读同一份授权，同一个租户里就能分出管理员（能改）与员工（只能看）。用法见 <a href="/docs/adapters/supabase#配置成员权限">Supabase 适配器的配置成员权限</a>。

平台默认不改变任何人能做的事：anon 没有作用域，登录用户只在自己的 `user:<auth.uid()>` 上有 `read + edit`。同步日志、读授权（`rxdb_caller_buckets()`）与已有的写策略都不变，已有客户端不升级也照常同步。

## 变化

| 对象                                          | 变化                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `rxdb_caller_grants()`（04）                  | 新函数，返回 `scope text, permissions text[]`；部署方按自己的成员表 `CREATE OR REPLACE` 覆盖 |
| `rxdb_caller_scopes(p_permission text)`（04） | 新函数，读 `rxdb_caller_grants()`，返回带有这项权限的作用域键数组；写在 RLS 里按语句求值一次 |
| 生产权限脚本                                  | 两个新函数收回 `PUBLIC`，授给 `anon`、`authenticated` 与 `service_role`；anon 调用得到空结果 |

## 升级

### 1. 更新服务端 SQL

04 与生产权限脚本在同一个事务里执行，任一步失败整批回滚。04 每次执行都会把 `rxdb_caller_can_edit` 恢复成平台默认（远端变更历史的判定，见<a href="/docs/adapters/supabase#按自己的权限模型判定">按自己的权限模型判定</a>），覆盖过它的部署把自己的覆盖放在生产权限脚本之前：

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f docker/sql/04-rxdb-utils-functions.sql \
  -f path/to/your-caller-can-edit.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

只做这一步就够了：平台默认的授权与现有的写策略、历史判定都对得上，没有人多出或少了权限。使用 Supabase SQL Editor 时，把 `BEGIN;`、几份文件的完整内容和 `COMMIT;` 放在**同一次执行**中。

### 2. 按成员权限区分管理员与员工（可选）

要在同一个租户里分出管理员与员工，按顺序做三件事，放进同一个事务：

1. 成员表加权限列（取值限定在自己的权限集合里，缺省只读），覆盖 `rxdb_caller_grants()`，按成员行补上 `tenant:<租户 id>` 与它的权限；
2. 业务表的写策略从「是成员」改判「在该作用域有 `edit`」：`= ANY((SELECT public.rxdb_caller_scopes('edit'))::text[])`；
3. `rxdb_caller_can_edit` 的覆盖同样改判 `edit`，员工看不到远端变更历史。

示例与成员表的列权限、改权限的 RPC 见<a href="/docs/adapters/supabase#配置成员权限">配置成员权限</a>。顺序不能反：写策略先改判 `edit`、覆盖还没装上时，`rxdb_caller_scopes('edit')` 只有调用者自己的 user 区，租户里的写入全部被拒，直到覆盖装上（不会放宽）。

加权限列的时候，已有成员一律拿到缺省权限。原来能改的成员要在同一个事务里补上 `edit`，否则升级之后他们的推送都会被拒：

```sql
UPDATE app.tenant_members SET permissions = ARRAY['read', 'edit', 'manage']::text[]
WHERE (user_id, tenant_id) IN (SELECT user_id, tenant_id FROM app.tenant_admins);  -- 换成你认定管理员的方式
```

降权立即生效：被降权的成员在本机还没推送的修改，推送时被拒（`42501`，回执为被拒），本机按远端对齐。

### 3. 客户端

不需要升级。要按权限显隐写入口的界面，在连接时、每次拉取与改了成员关系之后调一次 `supabase.rpc('rxdb_caller_grants')`；它只决定入口给不给，能不能写以服务端的 RLS 为准。

也可以把判定交给引擎：给实体声明作用域与所需权限（[按作用域的成员权限](/model-definition/permissions.md#scoped-member-permissions)），Supabase 适配器在连接时、同步每一轮进门时读 `rxdb_caller_grants()`，本机当场拒绝越权的写，界面可以订阅 `rxdb.grants.snapshot$`。这样的客户端要在第 1 步装好之后再上线：服务端没有 `rxdb_caller_grants()` 时，连接报 `SupabaseConfigError`（`The server has no public.rxdb_caller_grants() …`），按第 1 步部署之后重新连接即可。没有实体声明作用域的客户端不读这个函数，不受影响。

以后每次重新执行 04（例如别的升级），`rxdb_caller_grants()` 与 `rxdb_caller_can_edit` 都会回到平台默认：同第 1 步，把覆盖放进同一个事务、生产权限脚本之前。

## 验证

以一个登录用户调 `rxdb_caller_grants()`，应得到自己的 `user:<auth.uid()>` 与 `{read,edit}`；覆盖之后还有所在租户的作用域与权限：

```sql
SELECT pg_catalog.set_config('request.jwt.claims', '{"sub":"<用户 id>","role":"authenticated"}', true);
SELECT * FROM public.rxdb_caller_grants();
SELECT public.rxdb_caller_scopes('edit');
```

在 SQL Editor 里以数据库属主身份执行、又没设 `request.jwt.claims` 时，`auth.uid()` 为空，两个函数都返回空结果。员工身份经 REST 新建本租户的行应得到 `42501`，修改、删除改到零行。
