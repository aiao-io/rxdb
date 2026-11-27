# Supabase 适配器

`@aiao/rxdb-adapter-supabase` 提供了与 [Supabase](https://supabase.com/) 后端的集成能力，实现本地数据与云端数据库的双向同步、实时订阅和事务性批量操作。

:::warning bigint / binary 不支持远程同步
Supabase adapter 当前不支持 `PropertyType.bigint` 或 `PropertyType.binary` 的远程 CRUD、
push、pull、RPC 与 Realtime。实际绑定 Supabase remote 的实体包含这些字段时，`connect()`
会在网络请求前 fail-fast；绕过连接校验直接访问该远程 Repository 也会立即失败。

只使用本地 adapter 的 bigint/binary 实体可以与其他 Supabase 同步实体共存，不会阻止整个
数据库连接。
:::

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-supabase @supabase/supabase-js
```

## 核心概念

### 变更追踪

所有数据变更统一记录到 `RxDBChange` 表（而非按实体分表），每条记录包含：

- `namespace` / `entity` / `entityId` — 标识变更的实体
- `type` — `INSERT` / `UPDATE` / `DELETE`
- `patch` / `inversePatch` — 正向和反向补丁（用于撤销）
- `clientId` — 发起变更的客户端标识（用于过滤自身变更）
- `createdAt` / `updatedAt` — 推送写入的日志里，`createdAt` 是这条变更在本地的编辑时刻，`updatedAt` 是推送时刻。
  拉取方的 LWW 冲突裁决拿 `createdAt` 去比本机待推变更的编辑时刻，两侧必须是同一种时间

### 同步游标

使用 `RxDBChange` 表的自增 `id` 作为同步游标（而非时间戳），避免同毫秒内多条变更导致的重复问题。

自增 `id` 在写入时分配、提交时才对其他会话可见。为了让游标不漏行，参考 SQL 给 `rxdb_change` 挂了语句级触发器
`rxdb_change_serialize_append`：每个写日志的事务先取同一把事务级咨询锁，持有到提交，于是后提交的变更一定拿到更大的 `id`。
没有这把锁时，先拿到 `id` 却晚提交的事务，会被已经越过它的拉取方永久漏掉，而且不报错。

代价是写日志的事务从写第一条日志到提交这一段要排队：

- 推送在业务写完成之后才写日志，排队的只是尾段；
- 直写业务表的长事务会一直挡住推送，超过调用角色的 `statement_timeout` 时推送失败，下一轮同步重发；
- 直写的多语句事务与推送改到同一行时可能互锁，PostgreSQL 中止其中一个（SQLSTATE `40P01`），适配器的写入重试会重发被中止的推送。

游标只在同一个库里有效：库被推倒重建、或 `rxdb_change` 被 `TRUNCATE` 之后 `id` 从头计数，旧游标会越过新库的全部 `id`。
所以远端还有一个身份值：单行表 `rxdb_backend` 的 `id`，经 `rxdb_backend_id()` 读出（适配器的 `backendId()`）。
库重建时这张表跟着重建、生成新值，`TRUNCATE rxdb_change` 时触发器 `rxdb_change_rotate_backend_id` 换新值。
同步插件 `@aiao/rxdb-plugin-sync` 把它和游标存在一起，对不上就停止同步并报 `RemoteBackendMismatchError`，见[同步策略](../collaboration/sync.md#远端重置)。

### QueryCache 模式

`fetchMetadata` 只拉取 `{id, updatedAt}` 做新鲜度比较，脏数据再通过 `findByIds` 拉取完整内容，减少 90%+ 的数据传输量。

这条策略下 Supabase 是唯一事实源：写走 `create` / `update` / `delete` 直连远端，成功后才更新本地缓存；
本地**不记 `RxDBChange`**，因此没有 push 阶段，也没有 undo/redo 与冲突解决。远端已删除的行在下一次
同步该 `where` 时从本地清除。配置与调用面见[同步策略 · QueryCache 快速入门](../collaboration/sync.md#querycache-快速入门)。

## 按授权分区同步

US-033 把授权和实体筛选拆成两层。业务表的 `rxdb_bucket` 由数据库生成，决定一行属于哪个授权区。`rxdb_caller_buckets()` 决定当前调用者能读取哪些区，实体的 `remote.filter()` 只能在这些区内继续缩小范围。

### 声明业务表分区

在业务表上添加生成列。表达式由应用定义，客户端只能写入参与计算的业务列，不能直接改写 `rxdb_bucket`。

```sql
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visibility text NOT NULL,
  tenant_id uuid,
  title text NOT NULL,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE
      WHEN visibility = 'public' THEN 'public'
      WHEN tenant_id IS NOT NULL THEN 'tenant:' || tenant_id::text
      ELSE 'private:unassigned'
    END
  ) STORED
);

SELECT public.rxdb_enable_sync_for_table('documents', 'public', 'Document');
CREATE INDEX documents_rxdb_bucket_id ON public.documents (rxdb_bucket, id);
```

直写、`rxdb_mutations` 和触发器都会把变更记入对应区。一行从 `public` 换到租户区时，旧区日志是没有行内容的删除，新区日志包含完整行。这样失去授权的一方只会收到移除信号，不会从日志拿到新行内容。

### 配置 caller buckets

内置实现返回以下范围。

- `anon` 返回 `['public']`。
- 有用户身份的 `authenticated` 返回 `['public', 'user:<auth.uid()>']`。
- 租户区需要由应用根据成员关系追加，例如 `tenant:<tenant_id>`。

成员判断应放进 `SECURITY DEFINER` 函数，并固定 `search_path`。成员表至少建立 `(user_id, tenant_id)` 复合索引。策略中的 `auth.uid()` 用 `(SELECT auth.uid())` 包起来，让 PostgreSQL 可以把它按语句求值一次。

```sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE app.tenant_members (
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX tenant_members_user_tenant_idx
  ON app.tenant_members (user_id, tenant_id);

CREATE FUNCTION app.caller_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  SELECT tenant_id
  FROM app.tenant_members
  WHERE user_id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION app.caller_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.caller_tenant_ids() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rxdb_caller_buckets()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN ARRAY['public']::text[]
    ELSE ARRAY['public', 'user:' || auth.uid()::text]
      || COALESCE(
        ARRAY(
          SELECT 'tenant:' || tenant_id::text
          FROM app.caller_tenant_ids()
        ),
        ARRAY[]::text[]
      )
  END
$$;
```

生产权限脚本会把 `rxdb_change` 的 SELECT 策略限制为 `bucket = ANY(public.rxdb_caller_buckets())`，并保留未分区旧日志对 `authenticated` 的读取。应用业务表也要写匹配的 SELECT RLS。推荐把同一个 bucket 条件写在策略里，不要只依赖日志表的 RLS。

```sql
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select_by_bucket
ON public.documents
FOR SELECT
USING (rxdb_bucket = ANY((SELECT public.rxdb_caller_buckets())::text[]));
```

`::text[]` 不能省：`ANY((SELECT ...))` 的双层括号会被当成子查询，逐行拿 `text` 去比 `text[]`，建策略时报 `operator does not exist: text = text[]`。加上类型转换后整体是数组表达式，caller buckets 每条语句只求值一次。

`SECURITY DEFINER` 成员函数的所有者需要能够读取成员表。不要把成员表直接授给客户端角色，也不要在函数里使用可被客户端角色覆盖的 `search_path`。成员关系发生变化而业务表没有写入时，下一轮同步会按新的 caller buckets 加入或退出整个租户区。

重新执行 `02-rxdb-sync-functions.sql` 会把 `rxdb_caller_buckets()` 恢复成平台默认（只有 `public` 与 `user:<auth.uid()>`），升级命令里都有这一步。覆盖装回之前，同步拉取、业务表 RLS 与实时频道都只认默认的两个区：客户端把租户区当成已撤销，清掉本机这些区的数据，覆盖装回之后再整块重拉，期间没有任何报错。所以升级时把自己的覆盖放进同一个事务，排在生产权限脚本之前执行。

### 在授权区内使用实体 filter

`remote.filter()` 仍然使用 `SyncType.Filter` 的 `RuleGroup`。Supabase 适配器先按 caller buckets 拉取，再在每个已授权区内执行快照和增量 filter。客户端把 filter 改宽，不能扩大 `rxdb_caller_buckets()` 的授权范围。

```ts
@Entity({
  name: 'Document',
  tableName: 'documents',
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'wa-sqlite' },
    remote: {
      adapter: 'supabase',
      filter: () => ({
        combinator: 'and',
        rules: [{ field: 'visibility', operator: '!=', value: 'archived' }]
      })
    }
  }
})
export class Document extends EntityBase {}
```

每个分区、实体、分支和 filter 指纹都有独立进度。filter 放宽时，新指纹会对每个授权区重新补快照，因此早于当前日志游标、但现在才匹配的行也能拉到。filter 收窄时，旧指纹的数据会在新指纹的所有分区成功拉取后清理。变更让行离开 filter 时会生成本地删除动作。尚未推送的本地变更会保留，避免把离线写入误当成远端过期数据。

一个分区失败不会回滚其他分区的进度。失败分区保留自己的快照点和游标，下次从该分区继续拉取。分区权限被撤销时，本地会删除该分区的已同步行和进度记录。

### 在本机写分区实体

分区实体和普通实体一样可以在本机增删改（US-034）：写入留下带 `patch` / `inversePatch` 的变更，离线也能改，推送之前可以用 `rxdb.versionManager.history(Entity)` 撤销、重做。推送经 `rxdb_mutations`，不需要额外的协议：

- 区由服务端按写后的行算：载荷里的 `rxdb_bucket` 一律不认（它是生成列，推送不写它），分区日志也不带正文。每次修改的完整前后快照记在[远端变更历史](#远端变更历史)里，只对能编辑这一行的成员开放。
- 一行换区（例如公开改成租户内部）时，旧区记一条不带内容的移除、新区记一条写入；只读得到旧区的客户端下次同步时把这一行删掉。
- 能不能写由业务表 RLS 裁决。被拒的修改在本地对齐成远端的样子，被拒清单在 `rxdb.syncState` 的 `lastRejections` 里（见[被拒的推送](../plugins/rxdb-plugin-sync/README.md#被拒的推送)）；被移出某个区时，本地清理会跳过未推送的行，这些行随后推送被拒，同样对齐。
- 推送成功之后撤销历史清空，已推送的修改不能再撤销；拉取到远端改写了本地数据之后同样清空。没推送的修改照样待推。
- 与远端的修改冲突时沿用拉取的冲突解决（默认按编辑时刻 LWW）。

实体写权限的简写（`'both'` / `'system'`）是静态元数据，分不出身份；按身份在本机判定要给实体声明作用域与所需权限（[本机按成员权限判定](#本机按成员权限判定)）。没有声明时，不该写的身份（例如只读公开数据的 anon）由应用禁用写入口；就算在本机写了也推不上去：anon 不能调用推送。同一个租户里分管理员与员工见[配置成员权限](#配置成员权限)。

### 配置成员权限

caller buckets 只决定能读哪些区。同一个租户里要分出管理员与员工（员工能同步、浏览本租户的全部数据，但不能增删改，也看不到远端变更历史），在写侧按成员权限裁决（US-234）。权限只由服务端 RLS 裁决；客户端读到的授权只用于本机的快速失败与界面上的写入口（[本机按成员权限判定](#本机按成员权限判定)）。

`rxdb_caller_grants()` 说明调用者在各作用域上有哪些权限，一个作用域一行：

| 列            | 类型     | 含义                                                 |
| ------------- | -------- | ---------------------------------------------------- |
| `scope`       | `text`   | 作用域键，如 `user:<auth.uid()>`、`tenant:<租户 id>` |
| `permissions` | `text[]` | 调用者在这个作用域上的权限，如 `{read,edit,manage}`  |

平台默认（`04-rxdb-utils-functions.sql`）：anon 零行；登录用户只有自己的 `user:<auth.uid()>`，权限 `read`、`edit`，与历史判定的平台默认 `rxdb_caller_can_edit_default`「分区实体只认调用者自己的 user 区」同口径。权限名归部署方，参考实现用 epic-015 的六项：`read`（查看）、`edit`（增删改）、`comment`、`review`、`merge`、`manage`（调整成员权限）；管理员是 `read + edit + manage`，员工是 `read`。

`rxdb_caller_scopes(p_permission)` 返回调用者带有某项权限的全部作用域键，按键排序。写策略与历史判定都经它读 `rxdb_caller_grants()`，和客户端读到的是同一份结果。两个函数都授给 `anon` 与 `authenticated`，anon 得到空结果。

按自己的成员表覆盖 `rxdb_caller_grants()`（签名与返回列不变），与[配置 caller buckets](#配置-caller-buckets) 同一模式。接着上面的 `app.tenant_members`：

```sql
ALTER TABLE app.tenant_members
  ADD COLUMN permissions text[] NOT NULL DEFAULT ARRAY['read']::text[]
  CHECK (
    permissions <@ ARRAY['read', 'edit', 'comment', 'review', 'merge', 'manage']::text[]
    AND 'read' = ANY(permissions)
  );

CREATE OR REPLACE FUNCTION public.rxdb_caller_grants()
RETURNS TABLE (scope text, permissions text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'user:' || auth.uid()::text, ARRAY['read', 'edit']::text[]
  WHERE auth.uid() IS NOT NULL
  UNION ALL
  SELECT 'tenant:' || member.tenant_id::text, member.permissions
  FROM app.tenant_members AS member
  WHERE member.user_id = auth.uid()
  ORDER BY 1
$$;
```

成员表不授给客户端，覆盖用 `SECURITY DEFINER` 读它，并且只按 `auth.uid()` 取调用者自己的行。写策略与历史判定写成同一个条件，业务表的三条写策略都判 `edit`：

```sql
CREATE POLICY documents_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (('tenant:' || tenant_id::text) = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]));

CREATE POLICY documents_update ON public.documents
  FOR UPDATE TO authenticated
  USING (('tenant:' || tenant_id::text) = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]))
  WITH CHECK (('tenant:' || tenant_id::text) = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]));

CREATE POLICY documents_delete ON public.documents
  FOR DELETE TO authenticated
  USING (('tenant:' || tenant_id::text) = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]));

CREATE OR REPLACE FUNCTION public.rxdb_caller_can_edit(p_namespace text, p_entity text, p_row jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_namespace = 'public' AND p_entity = 'Document' THEN
      ('tenant:' || (p_row->>'tenant_id')) = ANY(public.rxdb_caller_scopes('edit'))
    ELSE public.rxdb_caller_can_edit_default(p_namespace, p_entity, p_row)
  END
$$;
```

和 caller buckets 一样，`(SELECT …)::text[]` 让成员权限每条语句只求值一次，不按行重复查成员表。读策略不变：员工仍是成员，`rxdb_caller_buckets()` 照样给他租户区，本租户的数据照常同步。

几条要点：

- **防自我提权**：客户端不能写权限列。演示那样允许自助加入的，成员表的 `INSERT` 只按列授予作用域列（`GRANT INSERT (tenant_id) ON … TO authenticated`），不授予 `UPDATE`：PostgreSQL 的 INSERT 列权限只检查语句里写到的列，自助加入只写作用域列，权限取缺省的 `read`。改权限只经 `SECURITY DEFINER` 的 RPC，函数里校验调用者在该作用域有 `manage`，并拒绝撤掉最后一个有 `manage` 的成员；参考实现是 `apps/dev-rxdb-supabase/supabase/catalog-demo.sql` 的 `demo_set_member_permissions`（先锁租户行，两个管理员同时互相降权也不会一个都不剩）。
- **权限放在成员表，不放 JWT**：权限按作用域算，塞进令牌的 `app_metadata` 不自然；令牌里的角色要等刷新才生效，成员表改了下一次请求就生效。
- **员工的列可见范围**：列权限按数据库角色授予，员工与管理员都是 `authenticated`，分不出人。员工读得到本租户行的全部列（演示里的成本价也一样）；按人隐藏列要改走视图或 RPC。
- **降权后推送被拒**：降权之前在本机改下、还没推送的修改，推送时 UPDATE 改到零行而行还在，报 `42501`，回执为被拒，本机按远端对齐，见[被拒的推送](../plugins/rxdb-plugin-sync/README.md#被拒的推送)。客户端在连接时、每次拉取与改了成员关系之后读一次 `rpc('rxdb_caller_grants')`，两次读之间界面上可能还是旧权限，以推送时服务端的裁决为准。撤销、重做不按权限禁用：员工本来写不出修改，撤掉降权之前的修改正好让本机回到远端的样子。
- **升级之后重新加载覆盖**：重新执行 `04-rxdb-utils-functions.sql` 会把 `rxdb_caller_grants()` 与 `rxdb_caller_can_edit` 都恢复成平台默认。覆盖装回之前，按 `rxdb_caller_scopes('edit')` 写的策略只认调用者自己的 user 区，租户里的写入全部被拒（不会放宽）。把覆盖放进升级的同一个事务、生产权限脚本之前，见[装上成员权限](#装上成员权限)。

#### 本机按成员权限判定

实体声明了作用域与所需权限（[按作用域的成员权限](/model-definition/permissions.md#scoped-member-permissions)）之后，适配器就是授权快照的来源：它读的正是上面的 `rxdb_caller_grants()`，本机按同一份授权当场拒绝越权的写，不留一条注定被 RLS 拒绝的待推修改。

```ts
@Entity({
  name: 'Document',
  tableName: 'documents',
  properties: [{ name: 'tenantId', type: PropertyType.string, columnName: 'tenant_id' }],
  // 与写策略里的 'tenant:' || tenant_id 拼出同一个键；requires 与策略判的权限相同
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: { create: { requires: 'edit' }, update: { requires: 'edit' }, delete: { requires: 'edit' } }
})
class Document extends EntityBase {}
```

- **什么时候读**：远端连接时、同步每一轮进门时（`pull` / `push` / `sync` 与按仓库的入口、`bulkSync`、`syncBranches`）、应用调 `rxdb.grants.refresh()` 时，各读一次；读之前先核对会话身份。应用不能再自己 `rxdb.grants.set()`。
- **没有实体声明作用域时一次都不读**：没装成员权限的部署照常可用，客户端升级不要求服务端同时升级。
- **服务端没装 `rxdb_caller_grants()`**：声明了作用域的客户端连接时报 `SupabaseConfigError`，点名缺的函数与部署文档；不会静默放行，也不当成空授权。先按[装上成员权限](#装上成员权限)部署。
- **离线**：连接时连不上远端，沿用本地库里上一次的快照；降权在下一轮同步之后才在本机生效，那之前写下的修改推送时被拒、按回执对齐（见上一条「降权后推送被拒」）。

`dev-rxdb-supabase` 的商品（`CatalogItem`）就是这样声明的：商品页的新建、编辑、删除按声明与授权快照逐行派生（`@aiao/rxdb-model` 的 `deriveRowCapabilities()` / `deriveCreateCapability()`），演示里没有自己的判定；员工在本机写当场 `PermissionDeniedError`，断网重开沿用上次的快照。

### 规则之外的公开数据：在线浏览

同步规则只把选中的公开行落到本机。没登录的访客还要能看到其余的公开数据时，另声明一个**只读浏览实体**：它映射服务端的公开视图，走 `SyncType.QueryCache`，以调用者身份在线查询，anon 不需要登录，也不需要匿名账号。

|            | 同步子集（分区同步的实体）                                                                                 | 浏览实体（QueryCache）               |
| :--------- | :--------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| 适用的数据 | 要离线可用的：关注的分类、近期的、收藏的；所在租户的数据                                                   | 规则之外、只在线查看的公开数据       |
| 本机       | 规则选中的完整子集，离线可读                                                                               | 只缓存查过的条件，每次查询向远端对账 |
| 写入       | 本机增删改，推送之前可以撤销、重做；推送由服务端按写后的行算区、按 RLS 裁决（US-034）                      | 只读：三项写权限都声明为只许系统写   |
| 相互关系   | 两个实体、两张本地表：同步的清理删不到浏览缓存，浏览也不改变同步子集；同一行可能两边各有一份，各自保持新鲜 |                                      |

公开视图只选公开行、只给可以公开的列（这里不含成本价 `cost`），并带上 QueryCache 需要的 `id`、`createdAt`、`updatedAt`：

```sql
CREATE VIEW public.catalog_items_public WITH (security_invoker = true) AS
  SELECT id, name, category, price, "tenantId", "createdAt", "updatedAt", "createdBy", "updatedBy"
  FROM public.catalog_items
  WHERE visibility = 'public';

GRANT SELECT ON public.catalog_items_public TO anon, authenticated;
```

视图有两种写法：

- **`security_invoker = true`（推荐）**：以查询者身份执行，业务表的 RLS 与列权限照常生效。anon 要对业务表有视图用到的那些列的 SELECT 权限，业务表的策略也要放行公开行（按区策略天然放行 `public` 区）；要藏起来的列用列权限收回，例如 `REVOKE ALL ON public.catalog_items FROM anon` 之后按列 `GRANT SELECT (...)`。
- **定义者权限（不写 `security_invoker`）**：以视图属主身份执行，绕过业务表的 RLS 与列权限，业务表可以完全不授权给 anon，视图就是唯一入口。代价是视图里的 `WHERE` 成了唯一的防线，Supabase Advisor 会把它报成 `security_definer_view`（ERROR）。

浏览实体与同步实体分开声明，同步类型用 `syncOverrides` 给出：

```ts
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

@Entity({
  name: 'PublicCatalogItem',
  tableName: 'catalog_items_public',
  permissions: { create: 'system', update: 'system', delete: 'system' },
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'category', type: PropertyType.string },
    { name: 'price', type: PropertyType.number }
  ]
})
export class PublicCatalogItem extends EntityBase {}

const rxdb = new RxDB({
  // ...
  entities: [CatalogItem, PublicCatalogItem],
  syncOverrides: [
    {
      entity: CatalogItem,
      sync: {
        type: SyncType.Filter,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase', filter: () => followedCategoriesRule() }
      }
    },
    {
      entity: PublicCatalogItem,
      sync: { type: SyncType.QueryCache, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
    }
  ]
});
// 传工厂函数本身，不要调用它。注册顺序随意，宿主按 `inject` 保证 history 先于 sync
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);
rxdb.use(rxDBPluginQueryCache);
```

浏览要按有界条件查，例如按分类、按名称关键字再分页。QueryCache 的同步粒度是整个 `where`：每次查询都要取该条件命中的全部 `{ id, updatedAt }` 来对账，`limit` 收窄不了这一步，无条件列出全部公开行就是每次拉回全部元数据。查过的行变成私有或被删除，下一次查同一个条件时从浏览缓存里消失。

想把浏览到的内容变成离线可用，就把它加进同步规则（例如关注这个分类）：规则放宽后，下一次同步按新的条件指纹给每个授权区补快照，之后这些行在同步实体里离线可读。浏览实体本身不落进同步子集。

浏览实体映射到视图时，连接期的 [RLS 自检](#rls-自检) 认得视图，不会把它报成缺表或未开 RLS。

### 为每个身份创建本地库

用 `scopedDatabaseName()` 给每个 Supabase 项目和身份生成稳定、互不相同的数据库名。结果包含不透明的身份摘要，不包含用户 ID 原文。未登录时使用 `RXDB_ANONYMOUS_SUBJECT`，匿名登录用户仍使用 Supabase JWT 的 `sub`，因此不会与未登录访客共用本地库。

```ts
import { RXDB_ANONYMOUS_SUBJECT, RxDB, SyncType, type RxDBIdentity } from '@aiao/rxdb';
import { scopedDatabaseName } from '@aiao/rxdb-plugin-sync';

const supabaseUrl = 'https://your-project.supabase.co';
const identity: RxDBIdentity = {
  // 与适配器 callerIdentity() 报告的同口径：项目 URL 的 origin，不带尾斜杠和路径
  scope: new URL(supabaseUrl).origin,
  subject: session?.user.id ?? RXDB_ANONYMOUS_SUBJECT
};

const rxdb = new RxDB({
  dbName: scopedDatabaseName('notes', identity),
  identity,
  entities: [Document],
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'supabase' }
  }
});
```

同步第一次访问远端时还会在本地绑定身份。已绑定 A 的数据库被 B 或 anon 继续使用，会抛身份不匹配，不会发起远端请求，也不会修改本地行。应用应关闭当前实例，按当前 Supabase 会话重新计算数据库名，再打开对应身份的库。A 刷新 token 只要 `sub` 不变，就继续使用 A 的库。

声明了 `identity` 时，会话先与声明的身份核对，对不上抛核心的 `RxDBIdentityMismatchError`，本地绑定不会被写错；没有声明时按第一次同步的会话绑定，之后对不上抛同步插件的 `IdentityMismatchError`。这份绑定同时记进库的身份绑定：应用之后改为声明 `identity` 打开同一个库，打开时按第一次同步的那个会话核对，声明成别的身份会被拒绝连接。`IdentityMismatchError` 是 `RxDBIdentityMismatchError` 的子类，按后者 catch 能接住两种情况：

```ts
import { RxDBIdentityMismatchError } from '@aiao/rxdb';

try {
  await rxdb.syncManager.sync();
} catch (error) {
  if (!(error instanceof RxDBIdentityMismatchError)) throw error;
  await rxdb.disconnectAll();
  // 重新用当前 session 的 identity 创建 scopedDatabaseName() 对应的实例
}
```

身份绑定同样适用于使用 `accessToken` 回调创建的 Supabase 客户端：绑定与核对都按随请求发出的那个令牌，不会调用该客户端不支持的 `auth.getSession()`。一个令牌只有一个身份，`service_role` 令牌的身份是 `service_role`，不会被当成 anon。

## 基础使用

### 方式一：传入 URL + Key

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo, User, Order],
  sync: {
    remote: { adapter: 'supabase' },
    type: SyncType.Full
  }
});

rxdb.adapter('supabase', db => {
  return new RxDBAdapterSupabase(db, {
    supabaseUrl: 'https://your-project.supabase.co',
    supabaseKey: 'your-anon-key'
  });
});
```

### 方式二：传入已有客户端

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://your-project.supabase.co', 'your-anon-key');

rxdb.adapter('supabase', db => {
  return new RxDBAdapterSupabase(db, { client: supabase });
});
```

:::tip 客户端优先
传入 `client` 时以它为准，`supabaseKey` 不再使用。`supabaseUrl` 可以不给；给了就要与客户端指向同一个项目（按 URL 的 origin 比较），否则构造适配器时抛 `SupabaseConfigError`：调用者身份的 `scope` 取客户端的项目 URL，两边对不上时适配器不猜是哪个项目。推荐在已有 Supabase 客户端的项目中使用此方式，避免创建多个实例。
:::

:::caution 日志同步按身份与分区授权
按[生产权限脚本](#日志同步只对已登录身份开放)部署后，`anon` 可以读取分区日志中的 `public` 区，`authenticated` 可以读取 `rxdb_caller_buckets()` 返回的分区；通用日志拉取、推送、分支登记与实时通知仍只对 `authenticated` 开放。只拿 anon key 的客户端不能调用通用日志协议，也不会订阅实时通知。

按授权分区同步需要把应用里已经登录的 Supabase 客户端交给适配器。方式一创建的客户端没有应用会话，只适合公开区的只读 RPC 或 QueryCache。使用静态 `accessToken` 配置时，适配器会从 JWT 的 `sub` 绑定本地身份。
:::

## 配置选项

```typescript
interface SupabaseAdapterOptions extends IRxDBAdapterOptions {
  /** Supabase 项目 URL */
  supabaseUrl?: string;

  /** Supabase API Key（通常使用 anon key） */
  supabaseKey?: string;

  /** 已有的 Supabase 客户端实例（优先级高于 URL + Key；同时给了 supabaseUrl 时须指向同一个项目） */
  client?: SupabaseClient;

  /**
   * 连接时执行 RLS 自检。
   * 默认会调用 `rxdb_check_rls` RPC 并在发现表未启用 RLS 时输出告警。
   */
  rlsCheck?:
    | boolean
    | {
        rpcName?: string;
        failureMode?: 'warn' | 'throw';
        tables?: Array<{ schema?: string; table: string }>;
      };
}
```

### RLS 自检

`connect()` 默认会尝试调用 `rxdb_check_rls` RPC，检查当前 RxDB 业务表是否启用了 Row Level Security。

默认检查日志表 `rxdb_change`、分支表 `rxdb_branch`，以及经远端同步的业务实体映射的表或视图。同步插件等贡献的系统表（`rxdb_migration`、`rxdb_sync`、`rxdb_sync_bucket_progress` 等）只存本地，只存本地的业务实体也没有远端表，都不检查。`rlsCheck.tables` 给出的表原样检查。

视图没有自己的 RLS。普通视图以属主权限执行，有它 `SELECT` 权的人都能绕过底层表的 RLS，所以与未开 RLS 的表一样报出；只有 `security_invoker` 视图沿用调用者的权限与 RLS，不报（例如[公开数据的浏览实体](#规则之外的公开数据在线浏览)映射的 `catalog_items_public`）。`rxdb_check_rls` 为此多返回一个 `securityInvoker`；没有升级参考 SQL 的服务端不返回它，映射到视图的实体一律被报出。普通视图改成 `CREATE OR REPLACE VIEW … WITH (security_invoker = true)` 重建。

- 如果 RPC 已安装且发现某张表未启用 RLS，会输出告警。
- 如果你希望在开发或 CI 中直接阻断错误配置，可以设置 `rlsCheck: { failureMode: 'throw' }`。
- 如果你的环境自行保证了 RLS，也可以设置 `rlsCheck: false` 关闭这一步。

仓库内置的 SQL 安装脚本已经包含 `rxdb_check_rls(jsonb)`，同步数据库初始化脚本后即可生效。

## 实时同步

适配器订阅 Supabase Realtime 的私有频道。未分区旧日志使用 `rxdb:changes`，按 bucket 分区的日志使用 `rxdb:changes:bucket:<bucket>`。适配器根据当前身份从 `rxdb_caller_buckets()` 获取可订阅的分区频道。收到「哪些实体在哪个分支变了」的通知后，由同步插件累计可拉取条数，数据本身以订阅者自己的身份拉取：

- 通知由参考 SQL 的语句级触发器 `rxdb_change_broadcast` 在日志落库后经 `realtime.send` 发出，同一 bucket 每 200 条变更聚合成一条。载荷只有元数据（`namespace`、`entity`、`entityId`、`type`、`branchId`、`clientId`、`createdAt`、`bucket`），**不带** `patch`、`inversePatch`、`beforeData`、`afterData`。
- 频道是私有的：Realtime 加入时按 `realtime.messages` 的 RLS 策略以当前登录身份放行。旧日志频道只对 `authenticated` 开放，分区频道还要匹配 `rxdb_caller_buckets()`，任何频道都不开放客户端发送。适配器订阅前先调用 `client.realtime.setAuth()`，否则 Realtime 客户端带着 apikey（anon 的令牌）加入，会被拒绝。
- 没登录时不订阅：令牌是 anon key、不是 JWT（如 `sb_publishable_` 开头的新式 key）或干脆没有时，`connect()` 只打一条 `console.info` 提示（访客是正式支持的身份，不算配置错误）、不发起订阅，也就不会反复重试；supabase-js 订阅后补报的 `INITIAL_SESSION` 不算身份变化，不会再建一遍。拉取与推送按每次请求的令牌鉴权，登录后立即可用；实时通知要在登录后再调一次 `rxdb.connect('supabase')` 开启。
- 认不出调用者时也不订阅：令牌声称是已登录角色（如 `authenticated`）却没有 `sub`，多见于自行签发的令牌。适配器不知道该按谁的分区订阅，打一条警告后跳过；`callerIdentity()` 对这样的令牌同样拒绝回答，声明了 `identity` 的实例因此不会与远端交换数据。
- 换了账号按新身份重建频道：用会话登录的客户端听 auth 事件；用 `accessToken` 回调的客户端没有 auth 事件，适配器在下一次同步问调用者身份、或再调 `rxdb.connect('supabase')` 时发现令牌换了主人，随即重建。
- 同一个身份的分区变了（被加进或移出租户）也重建频道：同步每次按区拉取与统计待拉数都会读 `rxdb_caller_buckets()`，读到的分区与订阅时不同，就按新分区重新订阅，新分区的通知不必等断线重连，被撤销分区的频道随之退订。订阅时分区没读出来、只订了旧日志频道的，下一次读成功时同样补上。
- 库里没有 `realtime.send`（没有 Realtime 服务的部署）时通知触发器什么都不发，推送与业务写照常提交。
- 派发的 Remote 事件 `data` 只有 `id`，不是整行。同步插件只用它累计可拉取条数（按当前分支过滤），活查询不监听远端事件。
- 当订阅状态变成 `CHANNEL_ERROR`、`TIMED_OUT` 或 `CLOSED` 时，适配器会自动以指数退避重连。成功重新订阅后，退避计数清零，并按各仓库的水位线重算一次可拉取条数。

```text
客户端 A 推送（rxdb_mutations RPC）或直接写业务表
    │
    ▼
写入实体表 + rxdb_change 表
    │
    ▼
rxdb_change_broadcast 触发器经 realtime.send 发通知（只有元数据）
    │
    ▼
已登录的客户端 B 收到通知（anon 订阅被拒）
    │
    ├── clientId === 自身？→ 忽略（避免回声）
    │
    └── 其余 → 派发 Remote 事件（data 只有 id），同步插件累计可拉取条数
         ├── INSERT → EntityRemoteCreatedEvent
         ├── UPDATE → EntityRemoteUpdatedEvent
         └── DELETE → EntityRemoteRemovedEvent
```

### 连接与断开

```typescript
// 启动实时订阅
await rxdb.connect('supabase');

// 断开订阅
await rxdb.disconnect('supabase');
```

## RPC 函数

适配器依赖以下 PostgreSQL 函数（需在 Supabase 数据库中预先创建）：

### rxdb_mutations

事务性批量操作，同时写入实体表和变更记录表：

```typescript
// 内部调用示意
const { data } = await client.rpc('rxdb_mutations', {
  p_upserts: [{ table: 'todos', schema: 'public', data: [...] }],
  p_updates: [{ table: 'todos', schema: 'public', data: [{ id, completed: true }] }],
  p_deletes: [{ table: 'todos', schema: 'public', ids: [...] }],
  p_changes: [...],        // RxDBChange 记录
  p_skip_sync: true         // 触发器捕获实际删除，RPC 在源日志后统一写入隐式 DELETE
});
```

| 参数                 | 类型      | 说明                                                                                                |
| -------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `p_upserts`          | `json[]`  | 按表分组的新增实体（全部列），`INSERT … ON CONFLICT DO UPDATE`                                      |
| `p_updates`          | `json[]`  | 按表分组的修改实体（`id` + 修改的列），普通 `UPDATE`                                                |
| `p_deletes`          | `json[]`  | 按表分组的删除 ID                                                                                   |
| `p_changes`          | `json[]`  | 变更记录（写入 RxDBChange 表）                                                                      |
| `p_skip_sync`        | `boolean` | 显式变更是否使用 `p_changes`；触发器捕获实际删除，RPC 在源日志后统一写入隐式 DELETE                 |
| `p_deferred_columns` | `json[]`  | 可选。外键成环时先写空、再补写的外键列 `{schema, table, column}`，见[外键成环](#外键成环的三遍执行) |

实体表按 `p_upserts` → `p_updates` → `p_deletes` 的顺序执行。返回对象的 `upserted` 数组包含新增行，直写事务（`p_skip_sync = false`）另包含修改的服务器行；推送不返回修改行。`updated` / `deleted` 为计数；推送还返回变更 ID 映射，启用推送回执时另含逐实体结果。

#### 修改的语义

本地修改推送为普通 `UPDATE`：只改载荷里出现的列，未出现的列保持远端原值；只受目标表的 UPDATE 与 SELECT 策略约束，不受 INSERT 策略约束。因此 owner 型策略下推送不必携带 `owner` 列，开放共享编辑的表上可以修改他人创建的行。

`mutations()` 同样把修改发到 `p_updates`。该批量直写路径使用序列化整实体，没有逐列脏追踪：`id` 用于定位，`createdBy` 不下发，其余出现的列参与 UPDATE，`updatedBy` 注入当前用户。服务器通过 `UPDATE … RETURNING` 返回实际写入的行，调用方可从 `mutations()` 返回值读取 `updatedAt` 等服务器字段；新增仍走 `p_upserts`。

普通单实体修改的 `save()` 经 `EntityManager.update` → `SupabaseRepository.update`，原本就执行 PostgREST 普通 UPDATE；只有需要批量图变更时才走 `mutations()`。现有 `EntityManager.save` 丢弃批量 RPC 的返回值并返回原实体，本次不改变这一行为，不承诺 `save()` 自动合并服务器字段。

`rxdb_batch_update_rows` 以 `SECURITY INVOKER` 执行 UPDATE 并返回行；直写角色需要返回列的 SELECT 权限，修改后的行也要满足 SELECT 策略。推送与原 `rxdb_batch_update` 计数入口继续使用不带 RETURNING 的 UPDATE，保留原有列权限与 RLS 可见性语义，不因本次返回值需求新增全列 SELECT 或修改后行可见性要求。

某条修改更新到 0 行时抛错，不会静默跳过，也不会插入残缺行：

| SQLSTATE | `details.reason` | 含义                                   |
| -------- | ---------------- | -------------------------------------- |
| `42501`  | `denied`         | 行仍存在，但调用方的行级权限不允许修改 |
| `RX001`  | `gone`           | 行已不存在（被删除）                   |

两种错误的 `details` 都是 JSON 文本，键为 `op` / `schema` / `table` / `entityId` / `reason`；`message` 以 `rxdb:` 开头。直写的 `mutations()` 抛 `SupabaseDataError` 并整批回滚。推送是否整批失败或返回逐实体拒绝，取决于是否启用[推送回执](../migration/supabase-push-receipts.md)。

区分「被拒」与「已不存在」依赖存在性探针 `rxdb_existing_ids`（`SECURITY DEFINER`，只接受挂了 RxDB 同步触发器的表），它绕过行级权限回答「这些 id 是否存在」，不返回任何列值。从旧版本升级见 [Supabase 修改推送语义迁移](../migration/supabase-update-push.md)。

本地 push 的每条 `p_changes` 都携带 `clientId` 和 `localId`，两者组成远端幂等键。数据库必须安装 `docker/sql/01-rxdb-system-tables.sql` 中的部分唯一索引，并使用同版本的 `rxdb_mutations`：RPC 收到纯重试批次时返回首次提交的 remoteId，同时跳过重复的实体 upsert/delete。升级脚本会先为每个重复键保留最早 change、删除后续重复记录，再创建唯一索引。

#### 级联删除的日志

`p_skip_sync = true` 时，同步触发器在事务上下文中捕获实际 DELETE。RPC 先按源顺序整理客户端的 `p_changes`，再追加被 `ON DELETE CASCADE` 删除、但未显式下发的子行日志，统一写入 `rxdb_change`。每个隐式删除各有一条日志，`clientId` / `localId` 为 NULL，因此推送父删除的客户端自己也能拉回子行删除；完整 `OLD` 保存在 `beforeData`，`afterData = null`、`snapshotComplete = true`。

源日志排在隐式 DELETE 之前。同批先新增或修改子行、再删除父行时，其他客户端按 INSERT / UPDATE → 隐式 DELETE 拉取，最终子行保持不存在。RPC 保留数组顺序一次写入，两部分日志与业务写在同一事务内提交或回滚。

同批显式删除的子行保留客户端日志与 ID 映射，触发器只捕获 `OLD`，避免重复日志；显式删除与实际删除按 id 列类型的等值关系配对（与 DELETE 同一判据，uuid 大小写、`numeric` 的 `1` 与 `1.00` 认成同一行），并按分区根表归并，经分区根表或叶分区删除同样只记一条。若它先被行级策略拒绝、随后被允许的父删除级联，最终回执以实际删除为准，记为 `applied`；最后一条显式 DELETE 的快照一律取实际删除的 `OLD`，客户端 DELETE 的 `inversePatch` 不含 `id`，不能替代。成功批次重试会跳过实体副作用，隐式日志不会重复产生。

外键动作可删除调用方按业务表 RLS 看不到的子行。补出的日志沿用现有触发器模式的完整快照与可读范围，可能包含该子行的全部列。业务表 RLS 不会自动给日志提供逐行授权隔离，日志的读取策略必须按应用的数据边界单独设计。

#### 外键成环的三遍执行

两张表互相持有外键时（例如 shop 的 `"user"."idCardId"` ↔ `id_card."ownerId"`，都不是 `DEFERRABLE`），同批新建的一对无论先写哪一行都会撞外键。客户端在环上的可空外键处断环（见[外键成环](../collaboration/sync.md#外键成环)），把要先写空的列放进 `p_deferred_columns`，`rxdb_mutations` 在同一个事务里分三遍执行（US-038）：

1. 写 INSERT / UPDATE，延迟列先从载荷里拿掉：新建的行这一列为空，修改不动这一列；
2. 在执行 DELETE 之前补写延迟列；
3. 执行 DELETE。

补写以调用者身份执行普通 UPDATE，所以环上的表要给行的创建者开 UPDATE 策略。启用推送回执时，补写失败（`23503` / `42501` / `RX001`）的实体按补写的错误记为被拒，整轮回滚之后不带它重来，其余实体照常写入；被拒的实体被别的实体依赖时，那些实体随之以 `dependency` 被拒。配对校验、幂等跳过与日志都不变：日志的 `afterData` 是补写之后的最终值，重复调用不会重复写入。不带 `p_deferred_columns` 时只走一遍，与从前逐字相同。

延迟列在写任何东西之前校验，不合格就以 `RX003` 拒绝整次调用：

| 不合格的延迟列                                  | `RX003` 的 `message`                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 参数不是 JSON 数组                              | `rxdb: p_deferred_columns must be a JSON array`                                           |
| 元素缺键、或标识符不合法                        | `rxdb: invalid deferred column …`                                                         |
| 表或列不存在                                    | `rxdb: deferred column table … does not exist` / `rxdb: deferred column … does not exist` |
| 列是 `id`                                       | `rxdb: the id of … cannot be deferred`                                                    |
| 列非空                                          | `rxdb: deferred column … is NOT NULL`                                                     |
| 列不属于任何外键                                | `rxdb: deferred column … is not part of a foreign key`                                    |
| 列所在的复合外键是 `MATCH FULL`（一列空就违约） | `rxdb: deferred column … belongs to a MATCH FULL foreign key`                             |

延迟列只对 main 分支生效：非 main 分支只写日志、不写业务表，客户端不发这个参数。服务端还没有这个参数时，PostgREST 找不到七个参数的签名（`PGRST202`），客户端报 `SupabaseConfigError`，指向[迁移说明](../migration/supabase-fk-cycle-push.md)；没有环的模型不发这个参数，照常推送。

### 树查询 RPC

| 函数                   | 参数                 | 用途                   |
| ---------------------- | -------------------- | ---------------------- |
| `get_descendants`      | `root_id, max_level` | 递归 CTE 查询子孙节点  |
| `get_root_descendants` | `max_level`          | 查询所有根节点及其子孙 |
| `get_ancestors`        | `node_id, max_level` | 递归 CTE 查询祖先节点  |

## Pull/Push 同步

### 拉取变更

```typescript
// 基于游标拉取远程变更
const changes = await adapter.pullChanges(sinceId, limit);
```

- 使用 `RxDBChange.id`（自增）作为游标
- 支持 `repositoryFilter` 按实体过滤
- 支持 `filter`（RuleGroup）行级过滤
- 返回 `RemoteChange[]`，按 `id ASC` 排序

### 合并变更

```typescript
// 事务性双写：实体表 + RxDBChange 表
const maxChangeId = await adapter.mergeChanges(actions);
```

解析 `entityKey` 格式 `namespace:entity:entityId`，通过 `rxdb_mutations` RPC 实现原子性操作。

## 关系查询

适配器支持通过 PostgREST 的嵌套查询语法 实现关系数据的自动 JOIN：

| 关系类型     | 支持 | 示例                      |
| ------------ | ---- | ------------------------- |
| 多对一 (m:1) | ✅   | `order.customer`          |
| 一对一 (1:1) | ✅   | `user.profile`            |
| 一对多 (1:m) | ✅   | `customer.orders`         |
| 多对多 (m:n) | ✅   | `post.tags`（通过中间表） |

### 嵌套 WHERE 查询

支持通过点号路径查询关联实体的属性：

```typescript
// 查询有订单金额 > 100 的客户
const customers = await Customer.find({
  where: {
    'orders.amount': { $gt: 100 }
  }
});
```

## 查询操作符映射

| RxDB 操作符             | PostgREST 映射                   |
| ----------------------- | -------------------------------- |
| `=` / `!=`              | `eq` / `neq`                     |
| `<` / `<=` / `>` / `>=` | `lt` / `lte` / `gt` / `gte`      |
| `in` / `notIn`          | `.in()` / `.not('in')`           |
| `contains`              | `ilike.*value*`                  |
| `startsWith`            | `ilike.value*`                   |
| `endsWith`              | `ilike.*value`                   |
| `between`               | `.gte().lte()`                   |
| `null` / `notNull`      | `.is(null)` / `.not('is', null)` |
| `exists` / `notExists`  | 关联表 `!inner` JOIN             |

## 错误处理

```typescript
import {
  SupabaseSyncError,
  SupabaseConfigError,
  SupabaseNetworkError,
  SupabaseDataError
} from '@aiao/rxdb-adapter-supabase';

try {
  await rxdb.connect('supabase');
} catch (error) {
  if (error instanceof SupabaseConfigError) {
    // 配置错误：URL 或 Key 无效
  } else if (error instanceof SupabaseNetworkError) {
    // 网络错误：无法连接 Supabase
  } else if (error instanceof SupabaseDataError) {
    // 数据错误：类型转换失败等
  }
}
```

| 错误类型               | code                          | 场景                                            |
| ---------------------- | ----------------------------- | ----------------------------------------------- |
| `SupabaseConfigError`  | `CONFIG_ERROR`                | URL/Key 配置无效                                |
| `SupabaseNetworkError` | `NETWORK_ERROR`               | 网络连接失败                                    |
| `SupabaseDataError`    | 数据库错误码，或 `DATA_ERROR` | 远端拒绝（RLS、约束、行已不存在等）、响应不合规 |

远端返回了数据库错误时，`SupabaseDataError.code` 是那个错误码（SQLSTATE，如 `42501`、`RX001`；或 PostgREST 的 `PGRST*`），
`details` 是数据库的 `DETAIL`，`HINT` 会拼进 `message`；没有错误码的数据错误（响应形状不对、类型转换失败）`code` 为 `DATA_ERROR`。

## 数据类型转换

从 Supabase 返回的数据会自动转换：

| 属性类型                               | 转换规则         |
| -------------------------------------- | ---------------- |
| `date`                                 | `string → Date`  |
| `boolean`                              | `Boolean(value)` |
| `keyValue`                             | 递归转换嵌套属性 |
| `json` / `stringArray` / `numberArray` | 原样保留         |

`bigint` 与 `binary` 不在远程转换表中。需要保留原始类型与精确值时，请将对应实体配置为
local-only 并使用 SQLite family 或 PGlite；不要用 string/base64 fallback 绕过校验。

## 性能优化

1. **使用 QueryCache 模式**：`fetchMetadata` 只传输 `{id, updatedAt}`，大幅减少网络流量
2. **批量操作**：使用 `saveMany()` / `removeMany()` 代替逐条操作，减少 HTTP 请求数
3. **事务性双写**：`mutations()` 通过单次 RPC 调用完成所有操作，保证原子性
4. **游标同步**：基于自增 ID 而非时间戳，避免重复拉取

## 多对多中间表

多对多的连接实体推上远端、拉回本地，远端的中间表要按实体的形状建（US-228）：

```sql
CREATE TABLE shop."Category_OrderItem" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "categoriesId" uuid NOT NULL REFERENCES shop.category (id) ON DELETE CASCADE,
  "orderItemsId" uuid NOT NULL REFERENCES shop.order_item (id) ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar,
  PRIMARY KEY ("categoriesId", "orderItemsId"),
  CONSTRAINT "Category_OrderItem_id_key" UNIQUE (id)
);

SELECT public.rxdb_enable_sync_for_table('Category_OrderItem', 'shop', 'Category_OrderItem');
```

- 表名、实体名都是连接实体名（两端实体名按字母序拼接），外键列是两条关系名加 `Id`。
- `id` 唯一：推送按它定位行（载荷里的 `id`、`rxdb_batch_upsert` 的 `ON CONFLICT (id)`），同步触发器按它记日志。
- 主键是两端外键：PostgREST 只把外键在主键里的表认作多对多中间表，主键换成 `id` 之后跨中间表的嵌入查询（`select=*,category(*)`）就找不到关系。两端成对唯一也由它保证。
- 两端外键 `ON DELETE CASCADE`：删掉任一端时关联行一起删掉。经推送删除时客户端已经按子在前推了关联行的删除；直接写业务表删掉一端时，触发器同样给级联删掉的关联行记日志，其他客户端拉取之后关联消失。
- 登记同步时顺带装上 `updatedAt` 触发器。

客户端关联行的 id 由两端 id 派生（[关联行的 id](../model-definition/relations.md#关联行的-id)），两个客户端并发关联同一对推上来的是同一个 id：后到的那次按 `id` upsert，远端只有一行，推送不失败。服务端自己写关联行时用同一个公式，不然之后客户端关联同一对会撞主键（`23505`）：

```sql
INSERT INTO shop."Category_OrderItem" (id, "categoriesId", "orderItemsId")
VALUES (
  extensions.uuid_generate_v5(
    '9fb02b21-84d4-40f2-8847-bb5c3878b0e0',
    'rxdb-junction:v1:shop.Category_OrderItem|categoriesId=' || $1::uuid || '|orderItemsId=' || $2::uuid
  ),
  $1,
  $2
);
```

外键按属性名排序拼接，uuid 写成小写（`uuid::text` 本就是小写）；`uuid_generate_v5` 来自 Supabase 默认装在 `extensions` schema 的 `uuid-ossp`。不带 `id` 直写时取 `gen_random_uuid()`，只适合客户端不会再关联的那些对。已有的随机 id 关联行怎么处理见[迁移说明](../migration/many-to-many-junction-id.md)。

## 远端变更历史

同步日志 `rxdb_change` 只是同步通道：分区日志不带正文，未分区日志对全部已登录身份可读，两者都不记操作者。要看一行被谁、从哪条路径、怎么改过，读远端变更历史（US-229）。

登记了同步的业务表每次生效的写入都在 `rxdb_change_history` 记一条，分区表与未分区表一样。历史与业务写入在同一事务里，被拒、回滚的写入不记；非 main 分支的推送只写日志、不写业务表，也不记。

| 字段                       | 含义                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `beforeData` / `afterData` | 写入前、写入后的整行；新增没有前像，删除没有后像                                                     |
| `patch` / `inversePatch`   | 这次改了什么、撤回这次写入要改回什么                                                                 |
| `actor` / `role`           | 操作者 `auth.uid()` 与 JWT 里的角色；`service_role` 或没有会话的写入，`actor` 为 `null`              |
| `source`                   | `trigger`：直接写业务表；`push`：经 `rxdb_mutations` 推送；`cascade`：推送里删父行时由外键带走的子行 |
| `clientId` / `localId`     | 推送这条变更的客户端与它的本地变更编号；直写为 `null`                                                |
| `bucket`                   | 写入时这一行所在的区，换区的修改记新区；未分区实体为 `null`                                          |
| `changeId`                 | 同一次写入在 `rxdb_change` 里的 id                                                                   |

推送记的是推上去的每条变更：两次推送之间的多次修改各记一条，撤销掉的那一对在本机就摘掉了，不会推上去。推送的快照是 `rxdb_mutations` 按调用者读到的前快照（或客户端补的 `inversePatch`）加上本次修改算出的，与它写进业务表的值一致。

### 读取历史

历史表开着 RLS 并 `FORCE`、不建策略，客户端角色直接 `SELECT` 一律被拒。读取只经 `rxdb_entity_history`（`SECURITY DEFINER`，只授给 `authenticated`，anon 没有执行权）：

- 只返回调用者**当前**能编辑的行的历史，由 `rxdb_caller_can_edit` 判定；判否的条目不返回，也不报错。
- 判定用每条历史记录时的行（`afterData`，删除取 `beforeData`）。一行从租户 1 改到租户 2 之后，改动前的历史只对租户 1 的成员可见，改动后的只对租户 2 的成员可见；行删掉之后，它的历史照样按删除前的行开放。
- 四个正文字段逐列按调用者角色的列 `SELECT` 权限脱敏：没有列权限的列在哪个正文字段里都不出现。
- 按 `id` 升序（即写入顺序）分页，一页 1～1000 条，默认 100 条。

适配器的 `getEntityHistory` 包了这个 RPC，`createdAt` 转成 `Date`，其余字段与上表一致：

```ts
import type { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';

const adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
const page = await adapter.getEntityHistory(CatalogItem, item.id, { limit: 50 });
const last = page.at(-1);
const nextPage = last ? await adapter.getEntityHistory(CatalogItem, item.id, { afterId: last.id, limit: 50 }) : [];
```

anon 调用、远端没有这个 RPC 或返回的不是历史数组时抛 `SupabaseDataError`；连不上远端时与其他远端调用一样抛 `NetworkOfflineError`。本机还没推送的修改不在远端历史里，它们在本机的撤销历史里（`rxdb.versionManager.history(Entity)`）。

### 按自己的权限模型判定

平台默认的 `rxdb_caller_can_edit_default`：未分区实体看调用者角色对业务表有没有 `UPDATE` 权限；分区实体只认调用者自己的 `user:<auth.uid()>` 区，公开区与其他区默认谁都看不到。权限模型不同的部署方用 `CREATE OR REPLACE` 覆盖 `rxdb_caller_can_edit`（签名不变），与[配置 caller buckets](#配置-caller-buckets) 同一模式；只改自己关心的实体，其余交回默认。dev-rxdb-supabase 的商品只对所属租户里有 `edit` 的成员开放（员工看不到），与 `catalog_items_member_*` 写策略同口径，都经 `rxdb_caller_scopes` 读成员权限（见[配置成员权限](#配置成员权限)）：

```sql
CREATE OR REPLACE FUNCTION public.rxdb_caller_can_edit(p_namespace text, p_entity text, p_row jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN p_namespace = 'public' AND p_entity = 'CatalogItem' THEN
            ('tenant:' || (p_row->>'tenantId')) = ANY(public.rxdb_caller_scopes('edit'))
        ELSE public.rxdb_caller_can_edit_default(p_namespace, p_entity, p_row)
    END
$$;

REVOKE ALL ON FUNCTION public.rxdb_caller_can_edit(text, text, jsonb) FROM PUBLIC, anon, authenticated;
```

未分区实体的默认只看表级权限。业务表用 RLS 按行限制编辑（例如只能改自己创建的行）时，默认判定比 RLS 宽：有表级 `UPDATE` 权限的已登录身份读得到这张表全部行的历史。正文本来就在对已登录身份可读的未分区日志里，多出来的是操作者与来源；这样的表也要覆盖判定，与 UPDATE 策略同口径。

`p_row` 是记录时的整行，判定只能用它和调用者的身份，不能假设这一行现在还在业务表里。判定函数只在读取 RPC 里以属主身份调用，覆盖之后同样收回客户端角色的执行权，免得它成了探测别人权限的通道。重新执行 `04-rxdb-utils-functions.sql` 会把它恢复成平台默认：升级之后先重新加载自己的覆盖，再执行生产权限脚本。`02-rxdb-sync-functions.sql` 对 `rxdb_caller_buckets()` 同理，见[配置 caller buckets](#配置-caller-buckets)。

### 保留期限

历史默认永久保留。每次生效的业务写入一条，条数与 `rxdb_change` 同阶；每条带两份整行快照与两份补丁，体积约为带正文的未分区日志的 1.5 倍（demo 的商品一条约 1 KB）。历史不参与同步，清理旧历史不影响任何客户端的拉取与推送；归档策略尚未提供，需要时以 `service_role` 或数据库属主身份按 `createdAt` 自行清理。

## 生产部署

### 让日志 id 顺序等于提交顺序

已有部署重新执行一次 `docker/sql/02-rxdb-sync-functions.sql` 即可装上 `rxdb_change_serialize_append` 触发器，
客户端无需升级，`01-rxdb-system-tables.sql` 不用重跑。升级前已经漏掉的变更不会自动补回，见[迁移说明](../migration/supabase-change-log-order.md)。

### 装上远端身份

已有部署先建 `rxdb_backend` 表，再重新执行新版 `docker/sql/02-rxdb-sync-functions.sql` 与生产权限脚本，最后升级客户端。
新客户端连到没有 `rxdb_backend_id()` 的库时，同步入口报 `Could not find the function public.rxdb_backend_id`。完整步骤见[迁移说明](../migration/supabase-remote-backend.md)。

有意重置远端时，推倒重建或 `TRUNCATE public.rxdb_change` 都会自动换身份，已有客户端停下来等应用改绑。
只 `DELETE` 日志、不重置序列时游标仍然有效，身份不变；手工 `ALTER SEQUENCE ... RESTART` 认不出来，要同时换一个身份。

### 更新 UPDATE 与级联删除函数

已有系统表与幂等索引的数据库，先在同一数据库事务中按 02 → 04 执行新版 `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql` 并一起提交，再升级客户端。前者更新 DELETE 捕获，后者更新 UPDATE 返回行与删除日志统一写入；两者必须配套，不能在写入流量下分别提交。

用 `psql --single-transaction` 同时传入两个 `-f`；Supabase SQL Editor 则须在同一次执行中用 `BEGIN` / `COMMIT` 包住两份文件的完整内容。若工具无法原子执行，须在维护窗口禁止业务写入，直到两份脚本部署完成。`01-rxdb-system-tables.sql` 本次无变化，无需为这两项修复重跑；从更早版本升级仍须满足原有系统表与推送回执迁移前置。完整命令见[迁移说明](../migration/supabase-update-push.md)。

### 装上远端变更历史

已有部署在同一个事务里按增量脚本 → 02 → 04 → 生产权限脚本执行一次（与[从旧版本升级](#从旧版本升级)同一条命令），再重新加载自己的 `rxdb_caller_can_edit` 覆盖并再执行一次生产权限脚本。02 会把 `rxdb_caller_buckets()` 恢复成平台默认，覆盖过它的部署把自己的覆盖放进同一个事务、生产权限脚本之前，见[配置 caller buckets](#配置-caller-buckets)。客户端无需升级就能继续同步，读历史要升级到带 `getEntityHistory` 的适配器。升级之前的写入没有历史。完整步骤见[迁移说明](../migration/supabase-change-history.md)。

### 装上外键成环的推送

已有部署在同一个事务里执行新版 `docker/sql/04-rxdb-utils-functions.sql` 与生产权限脚本：`psql --single-transaction -f docker/sql/04-rxdb-utils-functions.sql -f docker/sql/production/rxdb-change-grants.sql`。新版 04 删掉旧的六参数 `rxdb_mutations`、换成带 `p_deferred_columns` 的七参数版本，权限脚本按新签名重新授权。04 会把 `rxdb_caller_can_edit` 恢复成平台默认，覆盖过它的部署要重新加载自己的覆盖，再执行一次生产权限脚本。旧客户端不传这个参数，照常推送。环上的表要给行的创建者开 UPDATE 策略。完整步骤见[迁移说明](../migration/supabase-fk-cycle-push.md)。

### 装上成员权限

已有部署在同一个事务里执行新版 `docker/sql/04-rxdb-utils-functions.sql`、自己的覆盖与生产权限脚本：04 装上 `rxdb_caller_grants()` 与 `rxdb_caller_scopes()`，同时把 `rxdb_caller_can_edit` 恢复成平台默认，覆盖要在生产权限脚本之前重新加载。只装平台默认、不覆盖时，每个登录用户只在自己的 user 区上有 `read + edit`，现有的写策略与同步都不受影响。要按成员权限分管理员与员工，先覆盖 `rxdb_caller_grants()`，再把写策略与历史判定改判 `edit`（[配置成员权限](#配置成员权限)），三者放进同一个事务。客户端无需升级；给实体声明作用域、让本机也按成员权限判定的客户端（[本机按成员权限判定](#本机按成员权限判定)），要等服务端装好之后再上线，否则连接报错。完整步骤见[迁移说明](../migration/supabase-member-permissions.md)。

### 日志同步只对已登录身份开放

基础 SQL 里的 `docker/sql/01-rxdb-system-tables.sql` 与 `03-business-tables.sql` 以 `GRANT ALL ON ALL TABLES IN SCHEMA public` 给 `anon` / `authenticated` 授权；Supabase 的默认权限还会在建表、建函数时把执行权授给 `anon`。执行完基础 SQL 之后，再执行一次生产权限脚本：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/production/rxdb-change-grants.sql
```

脚本收口四类入口：

| 对象                                                                           | `anon`                              | `authenticated`                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| 变更日志 `rxdb_change` 与序列                                                  | 只读 `public` 区；其他行由 RLS 隐藏 | 只读；按 caller buckets 过滤，`INSERT` / `UPDATE` / `DELETE` 收回 |
| 分支 `rxdb_branch`                                                             | 无权限                              | 只读；写入只经 `rxdb_enable_sync_for_branch`                      |
| 分支所有者 `rxdb_branch_owner`                                                 | 无权限                              | 无权限（只经内部函数认领）                                        |
| 通用拉取、推送（`rxdb_mutations` 及其内部函数）、分支登记、`rxdb_existing_ids` | 不能调用；可调用按区只读 RPC        | 可以调用                                                          |
| `rxdb_server_version`、`rxdb_backend_id`、`rxdb_check_rls`                     | 可以调用（连接时用）                | 可以调用                                                          |
| 实时通知频道 `rxdb:changes` / `rxdb:changes:bucket:<bucket>`                   | 订阅被拒                            | 旧日志只能接收，分区频道按 caller buckets 接收，不能发送          |
| 远端身份 `rxdb_backend`                                                        | 只读                                | 只读                                                              |
| 远端变更历史 `rxdb_change_history` 与序列                                      | 无权限                              | 无权限（只经 `rxdb_entity_history` 读取）                         |
| `rxdb_entity_history`                                                          | 不能调用                            | 可以调用；只返回当前能编辑的行的历史，按列权限脱敏                |
| 成员权限 `rxdb_caller_grants`、`rxdb_caller_scopes`                            | 可以调用，结果为空                  | 可以调用；只返回调用者自己的授权                                  |

`anon` 仍可按业务表自己的 GRANT 与 RLS 直接读取公开业务行，也可以调用按区快照与按区变更 RPC。写入、通用日志拉取、分支登记和存在性探针仍然收回。推送之所以连同存在性探针一起收回：推送对「被 RLS 拒绝」与「已不存在」分别报 `42501` / `RX001`，本身就能判断某个 id 是否存在。

远端身份只读的原因：客户端能改这一行，就能让所有客户端误判远端已重置而停止同步；读取经 `rxdb_backend_id()`，轮换只经 `TRUNCATE rxdb_change` 的触发器，两者都是 `SECURITY DEFINER`。

分支表、远端身份表与日志表一样开着 RLS、只建读取策略。Supabase 上整库 `GRANT` 很常见，只收回写权限并不牢靠；没有写策略，客户端即便重新拿到写权限也改不了一行。这三张表因此不会被 Supabase Advisor 报成 `RLS Disabled in Public`，[RLS 自检](#rls-自检)默认检查的 `rxdb_branch` 也能通过。已有部署重新执行一次生产权限脚本即可生效。

脚本可以重复执行。任何含 `GRANT ALL ON ALL TABLES IN SCHEMA public` 的脚本（如 `docker/sql/01-rxdb-system-tables.sql`）重跑后会把权限放宽回去，01～04 里先 DROP 再重建的函数也会重新带上默认权限，之后都要再执行一次本脚本，所以它总是最后执行。本脚本只收回 RxDB 自己的对象：01 的整库授权会把执行那一刻 public 下的业务表一并放宽，这部分它收不回来。所以从旧版本升级时不重跑 01，走增量脚本，见[从旧版本升级](#从旧版本升级)；在已有业务表的库上首次执行 01 之后，要核对并恢复业务表自己的权限。仓库的开发初始化脚本（`docker/init-db.sh`）与 CI 的 Supabase 环境都在 01～04 之后加载它，开发库与生产同口径；仓库的 Supabase 测试以 `authenticated` 测试用户身份运行，对 `rxdb_change` 的预置与清理经 `service_role` 身份。

#### 适用边界

未分区旧日志仍对 `authenticated` 可读，而且带完整正文：没有启用 `rxdb_bucket` 的实体之后的新写入同样记成这种日志，不只是升级前的历史。`SyncType.Filter` 的过滤条件由客户端传入，不构成授权。启用 `rxdb_bucket` 的实体走按身份分区日志：anon 默认只读 `public`，authenticated 只能读 `rxdb_caller_buckets()` 返回的分区。过滤条件仍然只能在已授权分区内缩小范围，不能替代业务表 RLS。需要租户隔离的实体应完成生成列、caller buckets、业务表 RLS 和生产权限脚本的部署，再使用按区日志同步。

#### 非 main 分支按所有者写入

推送非 main 分支时，`rxdb_mutations` 只写日志、不写实体，业务表的 RLS 管不到它。参考 SQL 因此为每个非 main 分支记录所有者（`rxdb_branch_owner`，值为 `auth.uid()`）：

- 第一个登记（`rxdb_enable_sync_for_branch`）或推送该分支的已登录用户认领它。一次推送会顺带上行从未单独登记的祖先分支，它们同样由推送者认领。
- 之后只有所有者能登记、改写它，或往它推送日志；其他用户得到 `42501`（`rxdb: branch <id> belongs to another user`），整批回滚。
- 分支 ID 在一个后端里全局唯一、先到先得。两个用户各自建了同名分支（例如都叫 `feature-1`），后推送的一方会被拒；常见的名字也可能被别人先登记。给分支起名时带上用户前缀或随机后缀。名字已被占用时，只能由管理员改 `rxdb_branch_owner`。
- 已有日志或登记、却没有所有者的旧分支一律拒绝写入（`rxdb: branch <id> has no owner`）。从旧版本升级后，先以管理员身份为仍在使用的分支按分支 ID 补登所有者。只随推送上行的祖先分支不在 `rxdb_branch` 里，只出现在日志中，列出全部待补登分支的查询见[迁移说明](../migration/supabase-sync-access.md#3-为旧分支补登所有者)：

```sql
INSERT INTO public.rxdb_branch_owner ("branchId", "ownerId")
VALUES ('feature-checkout', '00000000-0000-0000-0000-000000000000')  -- 换成该分支用户的 auth.users.id
ON CONFLICT ("branchId") DO NOTHING;
```

分区实体的非 main 推送还要过两道检查，都在写日志之前、整批回滚：

- 变更的 `entityId` 要能转成业务表 `id` 列的类型（例如 `uuid` 表收到 `not-a-uuid`），否则得到 `22P02`。
- 变更要能定出分区：分区取 `rxdb_mutations` 记下的写后、写前快照里的 `rxdb_bucket`（快照由调用者读得到的当前行或客户端补的 `inversePatch`，加上本次的修改得出），定不出得到 `23502`；定出的分区不在 `rxdb_caller_buckets()` 里得到 `42501`。非 main 推送不以管理员权限去读业务表的行，免得这一步成了探测别人的行是否存在的通道。

main 推送的分区取写完之后业务表那一行的 `rxdb_bucket`。这次写让行换了区时，旧区记一条不带内容的移除，新区记一条写入，与直接写业务表时触发器记下的一致；同一批里同一行只记一次移除。

分支列表仍对全部登录者可读，分区日志按 caller buckets 过滤（见上面的适用边界）；多人共享同一分支的写入授权尚未提供。

#### 从旧版本升级

在同一个事务里（`psql --single-transaction`）依次执行增量脚本 `production/rxdb-sync-access-upgrade.sql`（建所有者表、把日志表移出 Realtime 发布）、`02-rxdb-sync-functions.sql`（所有者校验、通知触发器）、`04-rxdb-utils-functions.sql`（推送时校验分支所有者），最后执行生产权限脚本；然后升级客户端。不要为此重跑整份 01：它的整库授权会放宽业务表的权限。任一步失败整批回滚，库停在升级前的状态。02 与 04 会把 `rxdb_caller_buckets()` 与 `rxdb_caller_can_edit` 恢复成平台默认，覆盖过它们的部署在同一个事务里、生产权限脚本之前重新加载自己的覆盖。旧客户端订阅的是日志表的 `postgres_changes`，升级 SQL 之后收不到实时通知；把实体改成分区实体之前，拉取与推送不受影响（之后旧客户端会拉到不带正文的分区日志，先升级全部客户端）。依赖 anon key 同步的应用要先接入登录（或匿名登录）再升级。按区实体还要部署生成列、caller buckets 和对应 RLS。完整命令与旧分支补登见[迁移说明](../migration/supabase-sync-access.md)。

收紧后，日志只剩两条写入路径：

| 写入路径                                             | 怎么写日志                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 推送 `rxdb_mutations`                                | 触发器捕获实际 DELETE，RPC 将隐式日志追加在源日志之后，经内部函数 `rxdb_insert_changes`（`SECURITY DEFINER`）统一写入；main 分支的源日志必须与同批实体写入配对，否则 `RX002` |
| 直接写业务表（`mutations()`，`p_skip_sync = false`） | 同步触发器函数 `rxdb_log_change_trigger`（`SECURITY DEFINER`）写入                                                                                                           |

客户端经 PostgREST 直接写 `rxdb_change`，得到 `42501 permission denied for table rxdb_change`。直接调用 `rxdb_insert_changes` 也得到 `42501`（`rxdb: rxdb_insert_changes may only be called by rxdb_mutations`）：它只认 `rxdb_mutations` 在同一事务里设置的守卫，客户端无法预置这个守卫。

### 业务表 RLS 推荐策略

`rxdb_mutations` 是 `SECURITY INVOKER`，推送以调用方身份落库，业务表的行级安全策略直接决定哪些变更能写进去。建议对每个操作单独写一条策略，不要用一条 `FOR ALL` 覆盖全部操作：

```sql
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY todos_select ON public.todos
  FOR SELECT USING (true);

CREATE POLICY todos_insert ON public.todos
  FOR INSERT WITH CHECK ("createdBy" = auth.uid()::text);

CREATE POLICY todos_update ON public.todos
  FOR UPDATE USING ("createdBy" = auth.uid()::text);

CREATE POLICY todos_delete ON public.todos
  FOR DELETE USING ("createdBy" = auth.uid()::text);
```

分开写的原因：

- 修改推送是普通 `UPDATE`，只受 UPDATE 与 SELECT 策略约束（见[修改的语义](#修改的语义)）。`FOR ALL` 的 `WITH CHECK` 同时约束新建行和修改后的行，没法单独放宽修改。
- 「只读不改」「能改不能删」这类组合只有分开写才表达得出来。

`connect()` 默认会检查业务表是否启用了 RLS，见 [RLS 自检](#rls-自检)。

推送被策略拒绝时的表现取决于数据库与客户端的版本：

| 版本                                    | 表现                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 客户端不传 `p_receipts`（推送回执之前） | 整批回滚：抛 `SupabaseDataError`，`code` 为 `42501`（被拒）或 `RX001`（行已不存在），水位线不推进，整批变更仍待推送                                                                                       |
| 客户端与数据库都支持推送回执            | 逐实体处理：被拒的实体写上 `rejectedAt` 与 `rejection`，不再重推；同一批里其它实体照常落库；被拒列表经 `syncState.lastRejections` 暴露，见 [被拒的推送](../plugins/rxdb-plugin-sync/README.md#被拒的推送) |

两种版本的组合与升级顺序见 [Supabase 推送回执迁移](../migration/supabase-push-receipts.md)。

### 生产部署的已知限制

- **日志的读取范围**：带 `rxdb_bucket` 的日志按 `rxdb_caller_buckets()` 做 RLS，anon 默认只能读取 `public` 区，authenticated 只能读取已授权区。未分区旧日志仍按旧权限对 authenticated 可读。级联删除保留完整 `OLD` 快照，业务表的 RLS 不会自动套到日志上。
- **存在性信号**：已登录用户仍能经推送报错或 `rxdb_existing_ids` 判断某个 id 是否存在，见下文[已知限制](#已知限制)。id 不应承载敏感信息。
- **多人共享分支**：非 main 分支只允许所有者写入，见[非 main 分支按所有者写入](#非-main-分支按所有者写入)。

## 故障排查

### RPC 函数不存在

```text
ERROR: function rxdb_mutations does not exist
```

确保已在 Supabase 数据库中创建所需的 RPC 函数（`rxdb_mutations`、`get_descendants` 等）。

新客户端连旧版 SQL 时，推送报 `Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_skip_sync, p_updates, p_upserts)`：按[迁移说明](../migration/supabase-update-push.md)在同一事务中更新新版 02 与 04，再重试。

推送报 `SupabaseConfigError: The server rxdb_mutations does not accept p_deferred_columns`：模型里有外键成环的实体，服务端的 `rxdb_mutations` 还是旧版。按[外键成环迁移说明](../migration/supabase-fk-cycle-push.md)升级 04 与生产权限脚本，再重试。本地的行与待推变更都原样保留。

同步入口报 `Could not find the function public.rxdb_backend_id`：库里还没有远端身份，按[远端身份迁移说明](../migration/supabase-remote-backend.md)建表并重跑 02。

拉取或检查更新报 `Could not find the function public.rxdb_entity_sync_info`（或 `rxdb_caller_buckets`、`rxdb_bucket_snapshot_point`）：客户端已经升级、服务端还是旧版 SQL。新客户端按区同步要用这些函数，先按[日志同步迁移说明](../migration/supabase-sync-access.md)更新服务端 SQL，再升级客户端。

### 同步报 RemoteBackendMismatchError

本地游标属于另一个远端：远端被推倒重建、`rxdb_change` 被 `TRUNCATE`，或者 `supabaseUrl` 被改到了另一个项目。同步停在原地，本地数据没有被改动。
确认新远端就是要同步的那一个之后，调 `rxdb.syncManager.rebindRemoteBackend()` 再 `pull({ fetchAll: true })`；地址配错时改回原地址即可，不要改绑。

### 报 RxDBIdentityMismatchError

声明了 `RxDBOptions.identity` 的实例，库或远端会话属于另一个身份：

- `connect()` 时报：本地库绑定的是别的身份（例如换了账号却还开着上一个账号的库）。本地数据没有被改动，换到当前身份自己的库即可，库名用 `getRxDBIdentityDatabaseName` 算；
- 同步或 QueryCache 读写时报：库声明的身份是 A，而适配器的会话令牌已经是 B。一个请求都没发出，待推变更留在原处；会话回到 A 之后照常同步。

两种情况都不要改绑，见[每个身份一个本地库](../collaboration/sync.md#每个身份一个本地库)。

### Realtime 未收到变更

1. 确认 Supabase 项目已启用 Realtime，库里有 `realtime.send`（Realtime 服务启动时建）。
2. 确认已执行生产权限脚本：`realtime.messages` 上要有策略 `rxdb_changes_receive`，否则 `rxdb:changes` 或对应的 `rxdb:changes:bucket:<bucket>` 私有频道无法加入。
3. 确认客户端已登录：anon 订阅会被拒，订阅状态是 `CHANNEL_ERROR`，Realtime 日志里的 topic 会是 `rxdb:changes` 或对应的 bucket 频道。日志里的令牌若是 anon key 本身（`iss=supabase-demo` 之类），说明订阅前没有调 `realtime.setAuth()`。
4. 通知不经 `postgres_changes`：`rxdb_change` 不在 Realtime Publication 里是预期的，不要再把它加回去，否则订阅者会收到带 `patch` 的完整行。

如果启动日志提示 `RLS self-check skipped because RPC "rxdb_check_rls" is not installed`，说明数据库还没应用最新的 `04-rxdb-utils-functions.sql`。

### clientId 冲突

如果多个标签页使用相同的 `clientId`，会导致变更被错误过滤。确保每个客户端实例具有唯一的 `clientId`。

## 已知限制

- **存在性信号**：`rxdb_existing_ids` 绕过行级权限，回答同步表里某些 id 是否存在；推送对「被 RLS 拒绝」与「已不存在」分别报 `42501` / `RX001`，同样能判断。参考部署只对 `anon` 收回了这两条通道（anon 不能调用推送与探针）；已登录用户本来就能读全部日志，探测泄露的严格少于此。若你自行收紧了 `rxdb_change` 的读权限，这两条就是剩余的存在性通道。id 不应承载敏感信息：UUID 主键不可枚举，自增或业务主键可被逐个探测。非同步表（如 `auth.users`）一律拒绝探测。
