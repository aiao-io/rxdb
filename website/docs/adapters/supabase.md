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

### 同步游标

使用 `RxDBChange` 表的自增 `id` 作为同步游标（而非时间戳），避免同毫秒内多条变更导致的重复问题。

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

适配器通过 Supabase Realtime 订阅 `RxDBChange` 表的 `INSERT` 事件，实现跨客户端的实时同步：

- 当订阅状态变成 `CHANNEL_ERROR`、`TIMED_OUT` 或 `CLOSED` 时，适配器会自动以指数退避重连。
- 成功重新订阅后，退避计数会自动清零。

```
客户端 A 修改数据
    │
    ▼
写入实体表 + RxDBChange 表（通过 rxdb_mutations RPC）
    │
    ▼
Supabase Realtime 广播 INSERT 事件
    │
    ▼
客户端 B 收到变更
    │
    ├── clientId === 自身？→ 忽略（避免回声）
    │
    └── clientId !== 自身？→ 派发 Remote 事件
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
  p_skip_sync: true         // 跳过服务端同步触发器
});
```

| 参数          | 类型      | 说明                                                           |
| ------------- | --------- | -------------------------------------------------------------- |
| `p_upserts`   | `json[]`  | 按表分组的新增实体（全部列），`INSERT … ON CONFLICT DO UPDATE` |
| `p_updates`   | `json[]`  | 按表分组的修改实体（`id` + 修改的列），普通 `UPDATE`           |
| `p_deletes`   | `json[]`  | 按表分组的删除 ID                                              |
| `p_changes`   | `json[]`  | 变更记录（写入 RxDBChange 表）                                 |
| `p_skip_sync` | `boolean` | 是否跳过同步触发器（避免循环）                                 |

实体表按 `p_upserts` → `p_updates` → `p_deletes` 的顺序执行，返回对象含 `upserted` / `updated` / `deleted` 计数。

#### 修改的语义

本地修改推送为普通 `UPDATE`：只改载荷里出现的列，未出现的列保持远端原值；只受目标表的 UPDATE 与 SELECT 策略约束，不受 INSERT 策略约束。因此 owner 型策略下推送不必携带 `owner` 列，开放共享编辑的表上可以修改他人创建的行。

某条修改更新到 0 行时，整批回滚并抛错，不会静默跳过，也不会插入残缺行：

| SQLSTATE | `details.reason` | 含义                                   |
| -------- | ---------------- | -------------------------------------- |
| `42501`  | `denied`         | 行仍存在，但调用方的行级权限不允许修改 |
| `RX001`  | `gone`           | 行已不存在（被删除）                   |

两种错误的 `details` 都是 JSON 文本，键为 `op` / `schema` / `table` / `entityId` / `reason`；`message` 以 `rxdb:` 开头。客户端今天把两种失败都包装为 `SupabaseDataError`，推送失败、水位线不推进，本地变更仍待推送。

区分「被拒」与「已不存在」依赖存在性探针 `rxdb_existing_ids`（`SECURITY DEFINER`，只接受挂了 RxDB 同步触发器的表），它绕过行级权限回答「这些 id 是否存在」，不返回任何列值。从旧版本升级见 [Supabase 修改推送语义迁移](../migration/supabase-update-push.md)。

本地 push 的每条 `p_changes` 都携带 `clientId` 和 `localId`，两者组成远端幂等键。数据库必须安装 `docker/sql/01-rxdb-system-tables.sql` 中的部分唯一索引，并使用同版本的 `rxdb_mutations`：RPC 收到纯重试批次时返回首次提交的 remoteId，同时跳过重复的实体 upsert/delete。升级脚本会先为每个重复键保留最早 change、删除后续重复记录，再创建唯一索引。

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

## 故障排查

### RPC 函数不存在

```
ERROR: function rxdb_mutations does not exist
```

确保已在 Supabase 数据库中创建所需的 RPC 函数（`rxdb_mutations`、`get_descendants` 等）。

新客户端连旧版 SQL 时，推送报 `Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_skip_sync, p_updates, p_upserts)`：先执行新版 `docker/sql/04-rxdb-utils-functions.sql`，见 [迁移说明](../migration/supabase-update-push.md)。

### Realtime 未收到变更

1. 确认 Supabase 项目已启用 Realtime
2. 确认 `RxDBChange` 表已添加到 Realtime Publication
3. 检查 RLS（Row Level Security）策略是否允许读取

如果启动日志提示 `RLS self-check skipped because RPC "rxdb_check_rls" is not installed`，说明数据库还没应用最新的 `04-rxdb-utils-functions.sql`。

### clientId 冲突

如果多个标签页使用相同的 `clientId`，会导致变更被错误过滤。确保每个客户端实例具有唯一的 `clientId`。

## 已知限制

- **存在性探针**：`rxdb_existing_ids` 绕过行级权限，回答同步表里某些 id 是否存在。参考部署里 `rxdb_change` 本身对 `anon` 可读，探针泄露的严格少于此；但若你自行收紧了 `rxdb_change` 的读权限，探针就是剩余的存在性通道。id 不应承载敏感信息：UUID 主键不可枚举，自增或业务主键可被逐个探测。非同步表（如 `auth.users`）一律拒绝探测。
