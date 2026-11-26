# Supabase 外键成环的推送

US-038 让互相持有外键的实体能推拉，例如 shop 的 `User.idCard` ↔ `IdCard.owner` 这种双向一对一。客户端在环上的可空外键处断环，把互相引用的行放进同一次 `rxdb_mutations`。新参数 `p_deferred_columns` 告诉服务端哪些外键列先写空、在同一个事务里再补写。用法见[外键成环](../collaboration/sync.md#外键成环)，服务端怎么执行见 [Supabase 适配器](../adapters/supabase.md#外键成环的三遍执行)。

**谁要升级**：模型里有外键成环的实体、并推到 Supabase 的部署。升级之前，这样的模型连推拉都做不了：依赖图对所有仓库报 `Circular dependency detected`。没有环的模型不必为此升级，客户端不发这个参数；升级之后也没有影响。

**顺序**：先升级服务端，再升级客户端。旧客户端连新服务端照常推送（参数可选）。新客户端连旧服务端时，没有环的推送照常进行；需要先写空、再补写的那一批报 `SupabaseConfigError`，本地的行与待推变更都原样保留，升级服务端后重试即可。

## 变化

| 对象                                    | 变化                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb_mutations`（04）                  | 新增第七个参数 `p_deferred_columns jsonb DEFAULT '[]'`，旧的六参数签名被删掉：两个重载并存时，PostgREST 按命名参数选不出唯一的一个。不带这个参数时，行为与从前逐字相同 |
| `rxdb_mutations_deferred_columns`（04） | 新的内部函数：在写任何东西之前校验延迟列，不合格以 `RX003` 拒绝整次调用                                                                                                |
| `rxdb_mutations_apply_groups`（04）     | 新的内部函数：`rxdb_mutations` 第 3 步按载荷顺序执行业务写的那一段抽了出来，写 INSERT / UPDATE 时拿掉延迟列                                                            |
| `rxdb_mutations_fill_deferred`（04）    | 新的内部函数：在执行 DELETE 之前补写延迟列。补写失败的实体按补写的错误记为被拒，整轮回滚后不带它重来                                                                   |
| `production/rxdb-change-grants.sql`     | 授权清单换成七参数签名，并收进三个新的内部函数：对 `PUBLIC`、`anon` 收回，只授给 `authenticated`、`service_role`                                                       |

三个内部函数都是 `SECURITY INVOKER`，以调用者身份执行，直接调用拿不到额外的权限。

## 升级

### 1. 更新服务端 SQL

04 与生产权限脚本在同一个事务里执行：04 删掉旧签名、建新签名，生产权限脚本按新签名重新授权，两者之间不能有空档。整批可以重复执行。

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f docker/sql/04-rxdb-utils-functions.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

使用 Supabase SQL Editor 时，把 `BEGIN;`、两份文件的完整内容和 `COMMIT;` 放在**同一次执行**中。不要为此重跑整份 `01-rxdb-system-tables.sql`：它的整库授权会放宽业务表的权限，见[日志同步只对已登录身份开放](./supabase-sync-access.md#2-更新服务端-sql)。

执行完让 PostgREST 重新加载 schema，否则它还按旧签名找函数：

```sql
NOTIFY pgrst, 'reload schema';
```

### 2. 重新加载自己的覆盖

04 每次执行都会把 `rxdb_caller_can_edit` 恢复成平台默认（见[远端变更历史](./supabase-change-history.md#2-覆盖编辑权限的判定)）。覆盖过它的部署，执行完步骤 1 要重新加载自己的覆盖，再执行一次生产权限脚本：

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f path/to/your-caller-can-edit.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

### 3. 给环上的表开 UPDATE 策略

补写是以调用者身份执行的普通 `UPDATE`。环上带断环外键的那张表（shop 是 `"user"`），要允许行的创建者修改这一行，否则补写以 `42501` 失败，整对都被拒。只开了 INSERT 的表，补一条 UPDATE 策略，口径与[业务表 RLS 推荐策略](../adapters/supabase.md#业务表-rls-推荐策略)一致。

### 4. 核对实体的 `onDelete`

本地的删除动作要与远端外键一致，否则两端删出来的结果不同。一对一默认 `onDelete: CASCADE`，可空也一样。shop 的远端是 `user_idCardId_fkey ON DELETE SET NULL`（删身份证、留用户）和 `id_card_ownerId_fkey ON DELETE CASCADE`（删用户、连身份证一起删），所以 `User.idCard` 要显式写：

```ts
import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'User',
  namespace: 'shop',
  tableName: 'user',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'idCard',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'IdCard',
      mappedProperty: 'owner',
      nullable: true,
      onDelete: OnDeleteAction.SET_NULL
    }
  ]
})
export class User extends EntityBase {}
```

### 5. 升级客户端

升级 `@aiao/rxdb`、`@aiao/rxdb-plugin-sync` 与 `@aiao/rxdb-adapter-supabase`。Supabase 适配器声明了 `supportsDeferredForeignKeys`，推送需要先写空、再补写的那一批时，才带上 `p_deferred_columns`。

## 验证

新签名只有一个：

```sql
SELECT pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rxdb_mutations';
-- p_upserts jsonb, p_deletes jsonb, p_changes jsonb, p_skip_sync boolean, p_updates jsonb, p_receipts boolean, p_deferred_columns jsonb
```

查出两行说明旧签名还在，PostgREST 会报 `PGRST203`（选不出唯一的函数）：重新执行步骤 1。

再以一个已登录身份在本地同一个事务里新建互相引用的一对（`entityManager.saveMany([user, card])`）并推送。推送结果里 `rejected` 与 `failed` 都应为 0，远端两行互相引用。
