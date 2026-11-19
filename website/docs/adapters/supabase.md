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
传入 `client` 时，`supabaseUrl` 和 `supabaseKey` 会被忽略。推荐在已有 Supabase 客户端的项目中使用此方式，避免创建多个实例。
:::

:::caution 日志同步需要已登录身份
按[生产权限脚本](#日志同步只对已登录身份开放)部署后，变更日志的拉取、推送、分支登记与实时通知只对已登录身份（`authenticated` 角色）开放，只拿 anon key 的客户端会得到 `42501`。用方式二把应用里已经登录的客户端交给适配器；方式一由适配器自建客户端，和应用的登录客户端不是同一个实例，不要用于日志同步。

没有登录流程的公开演示可以先调 `supabase.auth.signInAnonymously()`：Supabase 匿名用户的角色也是 `authenticated`，代价见[适用边界](#适用边界)。
:::

## 配置选项

```typescript
interface SupabaseAdapterOptions extends IRxDBAdapterOptions {
  /** Supabase 项目 URL */
  supabaseUrl?: string;

  /** Supabase API Key（通常使用 anon key） */
  supabaseKey?: string;

  /** 已有的 Supabase 客户端实例（优先级高于 URL + Key） */
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

- 如果 RPC 已安装且发现某张表未启用 RLS，会输出告警。
- 如果你希望在开发或 CI 中直接阻断错误配置，可以设置 `rlsCheck: { failureMode: 'throw' }`。
- 如果你的环境自行保证了 RLS，也可以设置 `rlsCheck: false` 关闭这一步。

仓库内置的 SQL 安装脚本已经包含 `rxdb_check_rls(jsonb)`，同步数据库初始化脚本后即可生效。

## 实时同步

适配器订阅 Supabase Realtime 的私有频道 `rxdb:changes`，收到「哪些实体在哪个分支变了」的通知后，由同步插件累计可拉取条数，数据本身以订阅者自己的身份拉取：

- 通知由参考 SQL 的语句级触发器 `rxdb_change_broadcast` 在日志落库后经 `realtime.send` 发出，每 200 条变更聚合成一条。载荷只有元数据（`namespace`、`entity`、`entityId`、`type`、`branchId`、`clientId`、`createdAt`），**不带** `patch`、`inversePatch`、`beforeData`、`afterData`。
- 频道是私有的：Realtime 加入时按 `realtime.messages` 的 RLS 策略以当前登录身份放行，生产权限脚本只对 `authenticated` 开放接收，不开放发送。适配器订阅前先调用 `client.realtime.setAuth()`，否则 Realtime 客户端带着 apikey（anon 的令牌）加入，会被拒绝。
- 派发的 Remote 事件 `data` 只有 `id`，不是整行。同步插件只用它累计可拉取条数（按当前分支过滤），活查询不监听远端事件。
- 当订阅状态变成 `CHANNEL_ERROR`、`TIMED_OUT` 或 `CLOSED` 时，适配器会自动以指数退避重连。成功重新订阅后，退避计数清零，并按各仓库的水位线重算一次可拉取条数。

```
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

| 参数          | 类型      | 说明                                                                                |
| ------------- | --------- | ----------------------------------------------------------------------------------- |
| `p_upserts`   | `json[]`  | 按表分组的新增实体（全部列），`INSERT … ON CONFLICT DO UPDATE`                      |
| `p_updates`   | `json[]`  | 按表分组的修改实体（`id` + 修改的列），普通 `UPDATE`                                |
| `p_deletes`   | `json[]`  | 按表分组的删除 ID                                                                   |
| `p_changes`   | `json[]`  | 变更记录（写入 RxDBChange 表）                                                      |
| `p_skip_sync` | `boolean` | 显式变更是否使用 `p_changes`；触发器捕获实际删除，RPC 在源日志后统一写入隐式 DELETE |

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

### 日志同步只对已登录身份开放

基础 SQL 里的 `docker/sql/01-rxdb-system-tables.sql` 与 `03-business-tables.sql` 以 `GRANT ALL ON ALL TABLES IN SCHEMA public` 给 `anon` / `authenticated` 授权；Supabase 的默认权限还会在建表、建函数时把执行权授给 `anon`。执行完基础 SQL 之后，再执行一次生产权限脚本：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/production/rxdb-change-grants.sql
```

脚本收口四类入口：

| 对象                                                                       | `anon`               | `authenticated`                              |
| -------------------------------------------------------------------------- | -------------------- | -------------------------------------------- |
| 变更日志 `rxdb_change` 与序列                                              | 无权限               | 只读；`INSERT` / `UPDATE` / `DELETE` 收回    |
| 分支 `rxdb_branch`                                                         | 无权限               | 只读；写入只经 `rxdb_enable_sync_for_branch` |
| 分支所有者 `rxdb_branch_owner`                                             | 无权限               | 无权限（只经内部函数认领）                   |
| 拉取、推送（`rxdb_mutations` 及其内部函数）、分支登记、`rxdb_existing_ids` | 不能调用             | 可以调用                                     |
| `rxdb_server_version`、`rxdb_backend_id`、`rxdb_check_rls`                 | 可以调用（连接时用） | 可以调用                                     |
| 实时通知频道 `rxdb:changes`                                                | 订阅被拒             | 只能接收，不能发送                           |
| 远端身份 `rxdb_backend`                                                    | 只读                 | 只读                                         |

`anon` 仍可按业务表自己的 GRANT 与 RLS 直接读写业务表，只是不能经由日志同步协议。推送之所以连同存在性探针一起收回：推送对「被 RLS 拒绝」与「已不存在」分别报 `42501` / `RX001`，本身就能判断某个 id 是否存在。

远端身份只读的原因：客户端能改这一行，就能让所有客户端误判远端已重置而停止同步；读取经 `rxdb_backend_id()`，轮换只经 `TRUNCATE rxdb_change` 的触发器，两者都是 `SECURITY DEFINER`。

脚本可以重复执行。任何含 `GRANT ALL ON ALL TABLES IN SCHEMA public` 的脚本（如 `docker/sql/01-rxdb-system-tables.sql`）重跑后会把权限放宽回去，01～04 里先 DROP 再重建的函数也会重新带上默认权限，之后都要再执行一次本脚本，所以它总是最后执行。仓库的开发初始化脚本（`docker/init-db.sh`）与 CI 的 Supabase 环境都在 01～04 之后加载它，开发库与生产同口径；仓库的 Supabase 测试以 `authenticated` 测试用户身份运行，对 `rxdb_change` 的预置与清理经 `service_role` 身份。

#### 适用边界

日志对全部 `authenticated` 可读，`SyncType.Filter` 的过滤条件由客户端传、不构成授权。日志同步因此只适用于**所有登录者可见范围一致**的数据；开放注册或开启匿名登录的部署，等于把日志开放给任何访客。同一后端里不同用户看不同行（按租户、按所有者）的数据，不要用日志同步：可以用 QueryCache 模式以用户身份直接查业务表，读取由业务表的 RLS 裁决；同时不要为这些表启用日志触发器（`rxdb_enable_sync_for_table`），否则每次写入都会连同整行记进全员可读的日志。日志同步层面的已登录用户隔离尚在规划中。

#### 非 main 分支按所有者写入

推送非 main 分支时，`rxdb_mutations` 只写日志、不写实体，业务表的 RLS 管不到它。参考 SQL 因此为每个非 main 分支记录所有者（`rxdb_branch_owner`，值为 `auth.uid()`）：

- 第一个登记（`rxdb_enable_sync_for_branch`）或推送该分支的已登录用户认领它。一次推送会顺带上行从未单独登记的祖先分支，它们同样由推送者认领。
- 之后只有所有者能登记、改写它，或往它推送日志；其他用户得到 `42501`（`rxdb: branch <id> belongs to another user`），整批回滚。
- 已有日志或登记、却没有所有者的旧分支一律拒绝写入（`rxdb: branch <id> has no owner`）。从旧版本升级后，先以管理员身份为仍在使用的分支补登所有者：

```sql
INSERT INTO public.rxdb_branch_owner ("branchId", "ownerId")
VALUES ('feature-checkout', '00000000-0000-0000-0000-000000000000')  -- 换成该分支用户的 auth.users.id
ON CONFLICT ("branchId") DO NOTHING;
```

分支列表与分支日志仍对全部登录者可读（见上面的适用边界）；多人共享同一分支的授权尚未提供。

#### 从旧版本升级

依次重新执行 `01-rxdb-system-tables.sql`（建所有者表、把日志表移出 Realtime 发布）、`02-rxdb-sync-functions.sql`（所有者校验、通知触发器）、`04-rxdb-utils-functions.sql`（推送时校验分支所有者），最后执行生产权限脚本；然后升级客户端。旧客户端订阅的是日志表的 `postgres_changes`，升级 SQL 之后收不到实时通知，但拉取与推送不受影响。依赖 anon key 同步的应用要先接入登录（或匿名登录）再升级。完整步骤与旧分支补登见[迁移说明](../migration/supabase-sync-access.md)。

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

- **日志的读取范围**：日志对全部登录者可读，见[适用边界](#适用边界)。级联删除保留完整 `OLD` 快照，即使调用方按业务表 RLS 看不到子行；业务表的 RLS 不会自动套到日志上。
- **存在性信号**：已登录用户仍能经推送报错或 `rxdb_existing_ids` 判断某个 id 是否存在，见下文[已知限制](#已知限制)。id 不应承载敏感信息。
- **多人共享分支**：非 main 分支只允许所有者写入，见[非 main 分支按所有者写入](#非-main-分支按所有者写入)。

## 故障排查

### RPC 函数不存在

```
ERROR: function rxdb_mutations does not exist
```

确保已在 Supabase 数据库中创建所需的 RPC 函数（`rxdb_mutations`、`get_descendants` 等）。

新客户端连旧版 SQL 时，推送报 `Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_skip_sync, p_updates, p_upserts)`：按[迁移说明](../migration/supabase-update-push.md)在同一事务中更新新版 02 与 04，再重试。

同步入口报 `Could not find the function public.rxdb_backend_id`：库里还没有远端身份，按[远端身份迁移说明](../migration/supabase-remote-backend.md)建表并重跑 02。

### 同步报 RemoteBackendMismatchError

本地游标属于另一个远端：远端被推倒重建、`rxdb_change` 被 `TRUNCATE`，或者 `supabaseUrl` 被改到了另一个项目。同步停在原地，本地数据没有被改动。
确认新远端就是要同步的那一个之后，调 `rxdb.syncManager.rebindRemoteBackend()` 再 `pull({ fetchAll: true })`；地址配错时改回原地址即可，不要改绑。

### Realtime 未收到变更

1. 确认 Supabase 项目已启用 Realtime，库里有 `realtime.send`（Realtime 服务启动时建）。
2. 确认已执行生产权限脚本：`realtime.messages` 上要有策略 `rxdb_changes_receive`，否则私有频道 `rxdb:changes` 谁都加入不了。
3. 确认客户端已登录：anon 订阅会被拒，订阅状态是 `CHANNEL_ERROR`，Realtime 日志里是 `Unauthorized: You do not have permissions to read from this Channel topic: rxdb:changes`。日志里的令牌若是 anon key 本身（`iss=supabase-demo` 之类），说明订阅前没有调 `realtime.setAuth()`。
4. 通知不经 `postgres_changes`：`rxdb_change` 不在 Realtime Publication 里是预期的，不要再把它加回去，否则订阅者会收到带 `patch` 的完整行。

如果启动日志提示 `RLS self-check skipped because RPC "rxdb_check_rls" is not installed`，说明数据库还没应用最新的 `04-rxdb-utils-functions.sql`。

### clientId 冲突

如果多个标签页使用相同的 `clientId`，会导致变更被错误过滤。确保每个客户端实例具有唯一的 `clientId`。

## 已知限制

- **存在性信号**：`rxdb_existing_ids` 绕过行级权限，回答同步表里某些 id 是否存在；推送对「被 RLS 拒绝」与「已不存在」分别报 `42501` / `RX001`，同样能判断。参考部署只对 `anon` 收回了这两条通道（anon 不能调用推送与探针）；已登录用户本来就能读全部日志，探测泄露的严格少于此。若你自行收紧了 `rxdb_change` 的读权限，这两条就是剩余的存在性通道。id 不应承载敏感信息：UUID 主键不可枚举，自增或业务主键可被逐个探测。非同步表（如 `auth.users`）一律拒绝探测。
