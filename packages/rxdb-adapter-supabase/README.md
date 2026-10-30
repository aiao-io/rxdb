# @aiao/rxdb-adapter-supabase

RxDB Supabase 适配器 — 基于 PostgreSQL 的远程同步实现。

作为 RxDB 的 **remote** 适配器使用：本地用 SQLite（wa-sqlite / PGlite）离线读写，远程用 Supabase 做多端同步、实时推送与云端备份。

## 特性

- ✅ **完整 CRUD** — 通过 `SupabaseRepository` 封装 PostgREST
- ✅ **批量操作** — `saveMany` / `removeMany`（非事务）、`mutations`（RPC 事务）
- ✅ **事务支持** — 基于 PostgreSQL RPC `rxdb_mutations` 的原子写入
- ✅ **实时订阅** — 监听 `rxdb_change` 表的 INSERT，自动派发远程事件（带指数退避重连）
- ✅ **双向同步** — `pullChanges` / `mergeChanges` / `pullChangesBatch` 配合 RxDB VersionManager
- ✅ **树形结构** — `SupabaseTreeRepository`（按层 `select` 逐级展开，不依赖任何数据库函数）
- ✅ **RLS 自检** — 连接时校验目标表是否开启行级安全（可配 `warn` / `throw`）
- ✅ **瞬时错误重试** — 写入/事务路径对网关超时等瞬时错误自动重试

## 何时使用

- 需要多端数据同步（Web / 移动端 / 桌面端）
- 需要实时协作
- 需要云端备份与恢复
- 需要 PostgreSQL 高级特性（JSONB、全文搜索、RLS）
- 已有 Supabase 基础设施

## 与其他适配器对比

| 特性     | Supabase    | PGlite     | wa-sqlite |
| -------- | ----------- | ---------- | --------- |
| 部署模式 | 云端/自托管 | 本地       | 本地      |
| 多端同步 | ✅          | ❌         | ❌        |
| 实时订阅 | ✅          | ❌         | ❌        |
| 离线优先 | ✅（混合）  | ✅         | ✅        |
| 数据库   | PostgreSQL  | PostgreSQL | SQLite    |
| 认证集成 | ✅          | ❌         | ❌        |

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-supabase @supabase/supabase-js
# 本地适配器（二选一或按需）
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

> peerDependencies：`@aiao/rxdb`、`@supabase/supabase-js` ^2.88、`rxjs` ^7.8。

## 导出

- `RxDBAdapterSupabase` — 远程适配器主类
- `SupabaseRepository` — 表级 CRUD / 查询 Repository
- `SupabaseTreeRepository` — 树形（邻接表）Repository
- `SupabaseAdapterOptions` — 配置类型
- `SupabaseSyncError` / `SupabaseConfigError` / `SupabaseNetworkError` / `SupabaseDataError` — 错误类型
- `ADAPTER_NAME` — 常量 `'supabase'`

> ⚠️ 不存在 `createSupabaseAdapter()` / `createRxdb()` 这类工厂函数，请用下方的类 + `rxdb.adapter()` 注册方式。

### 错误类型的分工

**连不上远端时抛的是 core 的 `NetworkOfflineError`，不是 `SupabaseDataError`**——后者只表示远端给出的拒绝（RLS、约束、语法等）。判离线请用 `@aiao/rxdb` 的 `isNetworkError`，不要按 `SupabaseDataError` 捕获网络失败，否则断网时那条分支不会命中。

导出里的 `SupabaseNetworkError` 已 `@deprecated`，从未被抛出过，也不可用于表示离线。

这是相对早期版本的破坏性变更，迁移步骤见[《Supabase 传输失败错误类型迁移》](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/supabase-network-errors.md)。

## 快速开始

### 1. 配置 RxDB（本地 wa-sqlite + 远程 supabase）

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from './entities/Todo';

const rxdb = new RxDB({
  dbName: 'my-app',
  context: { userId: 'current-user-id' },
  entities: [Todo],
  sync: {
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'supabase' },
    type: SyncType.Full
  }
});

// 推拉同步住在 `@aiao/rxdb-plugin-sync`，它 `inject: ['plugin:history']`，两个都要装；
// 不装的话 `rxdb.syncManager` 这个槽位根本不存在（core 不做 fallback 兜底）。
// 必须早于 `connect()`——插件是在那一刻装上的。
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);

// 注册本地适配器
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS', async: true }));

// 注册远程适配器
rxdb.adapter(
  'supabase',
  async db =>
    new RxDBAdapterSupabase(db, {
      supabaseUrl: 'https://your-project.supabase.co',
      supabaseKey: 'your-anon-key'
      // 或复用已有客户端：client: existingSupabaseClient
    })
);

// 连接本地（自动建表）
await rxdb.connect('wa-sqlite');

// 连接远程（启动 Realtime 订阅 + RLS 自检）
const supabase = await rxdb.getAdapter('supabase');
await supabase.connect();
```

### 2. 数据操作（active-record 风格）

```typescript
// 创建
const todo = new Todo();
todo.title = 'Learn RxDB';
todo.completed = false;
await todo.save();

// 查询（本地 SQLite，响应式）
const todos = await rxdb.repository(Todo).find({
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
});
```

### 3. 同步

```typescript
await rxdb.syncManager.push(); // 推送本地变更到远程
await rxdb.syncManager.pull(); // 拉取远程变更到本地
await rxdb.syncManager.sync(); // 双向（pull + push）

// 也可按实体粒度同步
await rxdb.syncManager.pushRepository('public', 'Todo');
await rxdb.syncManager.pullRepository('public', 'Todo', { limit: 200 });
await rxdb.syncManager.syncRepository('public', 'Todo');
```

## 配置项（`SupabaseAdapterOptions`）

- `supabaseUrl?: string` — 项目 URL（与 `supabaseKey` 配合）
- `supabaseKey?: string` — API Key（与 `supabaseUrl` 配合）
- `client?: SupabaseClient` — 复用已有客户端，优先级高于 URL+Key
- `rlsCheck?: boolean | SupabaseRlsCheckOptions` — 连接时 RLS 自检；`false` 关闭，对象可配 `rpcName` / `failureMode` / `tables`

`rlsCheck` 默认行为：调用 RPC `rxdb_check_rls` 检查实体表是否启用 RLS，未启用时 **告警但不阻断**（`failureMode: 'warn'`）。设为 `'throw'` 可在生产环境强制阻断未开启 RLS 的连接。

```typescript
const adapter = new RxDBAdapterSupabase(rxdb, {
  client,
  rlsCheck: { failureMode: 'throw' }
});
```

严格模式下，目标表不存在、RLS 未启用、RPC 响应遗漏目标表、检查 RPC 缺失或检查请求失败都会拒绝 `connect()`，且不会启动 Realtime；后续重试会重新执行检查。该检查只确认目标表已启用 RLS，不验证 policy 内容、认证 claims、tenant ownership 或表级 grants，这些仍需在服务端独立审计。

`rxdb_mutations`、`rxdb_batch_upsert`、`rxdb_batch_update_rows`、`rxdb_batch_update` 和 `rxdb_batch_delete` 均以 `SECURITY INVOKER` 执行。调用角色必须拥有目标 schema 的 `USAGE`、目标表所需的 DML 权限及相关 sequence 权限；显式写入受该角色的 RLS policy 约束。仅授予 RPC 的 `EXECUTE` 权限不会绕过目标表权限或 RLS，也不要求目标表设置 `FORCE ROW LEVEL SECURITY`。外键级联可能删除调用方不可见的子行，其日志边界见下方[级联删除](#级联删除)。

## 数据库 Schema

适配器依赖两张系统表（**snake_case 表名，camelCase 列名加引号**），完整脚本见 [docker/sql/](https://github.com/aiao-io/rxdb/tree/main/docker/sql)。

### `rxdb_change`（变更记录）

```sql
CREATE TABLE public.rxdb_change (
  id            serial PRIMARY KEY,
  namespace     varchar NOT NULL DEFAULT 'public',
  entity        varchar NOT NULL,
  "entityId"    varchar NOT NULL,
  "branchId"    varchar DEFAULT 'main',
  type          varchar NOT NULL CHECK (type IN ('INSERT','UPDATE','DELETE')),
  patch         jsonb,
  "inversePatch" jsonb,
  "transactionId" uuid,
  "localId"     integer,
  "clientId"    varchar,
  "createdAt"   timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_rxdb_change_local_id_client_id
ON public.rxdb_change("clientId", "localId")
WHERE "clientId" IS NOT NULL AND "localId" IS NOT NULL;
```

`clientId + localId` 是本地 push 到远端的幂等键。从尚无此索引的旧库升级时，须按系统表迁移执行 `docker/sql/01-rxdb-system-tables.sql`；它为每个重复键保留最早的远端 change、删除后续重复记录，再建立部分唯一索引。本次函数升级还须将 02 与 04 放在同一数据库事务内执行，见下方[级联删除](#级联删除)及[迁移说明](https://rxdb.aiao.io/docs/migration/supabase-update-push)。

### `rxdb_branch`（分支元数据）

```sql
CREATE TABLE public.rxdb_branch (
  id            varchar PRIMARY KEY,
  activated     boolean DEFAULT false,
  "fromChangeId" integer,
  "lastPushedChangeId" integer,
  "lastPushedAt" timestamptz(3),
  "lastPulledAt" timestamptz(3),
  "parentId"    varchar,
  "createdAt"   timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz(3) NOT NULL DEFAULT now()
);
```

### 业务表列名

- **非主键字段的物理列名就是属性名**（camelCase 加引号，如 `"updatedBy"`、外键 `"parentId"`）。属性与关系上声明的 `columnName` 只对本地适配器生效，Supabase 远端的读、写、过滤、排序与树查询都按属性名访问列。
- **主键例外**：`id` 属性的 `columnName` 对直接访问业务表的路径生效——单实体 `create` / `update` / `remove`、`find` / `count`、树查询、`removeMany` 以及 QueryCache 的 `fetchMetadata` / `findByIds`。
- **批量直写只支持默认的 `id` 主键列**：`saveMany` 与 `mutations` 的载荷以 `id` 键定位行（`rxdb_mutations` 一族为 `ON CONFLICT (id)`），遇到自定义主键列时在发出任何请求前抛 `SupabaseConfigError`。
- **同步协议绑定业务表的 `id` 列**：变更日志触发器记录 `NEW.id`，`mergeChanges` 推送也以 `id` 键定位行，都不读实体主键的 `columnName`。参与同步的表主键列必须叫 `id`；只做同步的实体可以只在本地改主键列名。

> Realtime 需把 `rxdb_change` 加入 `supabase_realtime` publication；系统表初始化脚本已处理。
> 同步事务依赖 RPC：`rxdb_mutations`（内部调用 `rxdb_batch_upsert`、`rxdb_batch_update_rows`、`rxdb_batch_delete`、`rxdb_existing_ids`）、`rxdb_check_rls`、`rxdb_enable_sync_for_branch`。`rxdb_batch_update` 保留原有整数计数返回值。
> 树查询**不依赖任何数据库函数**：`SupabaseTreeRepository` 按层发 `select`（每层一次 `in('parentId', ...)`）逐级展开，
> 因此深树会产生与深度成正比的往返次数。

## API

### RxDBAdapterSupabase

```typescript
class RxDBAdapterSupabase extends RxDBAdapterRemoteBase {
  constructor(rxdb: RxDB, options: SupabaseAdapterOptions);
  readonly client: SupabaseClient;

  // 连接 / 生命周期
  connect(): Promise<IRxDBAdapter>; // RLS 自检 + 启动 Realtime
  disconnect(): Promise<void>;
  version(): Promise<string>;

  // 批量
  saveMany<T>(entities): Promise<T[]>; // upsert，非事务
  removeMany<T>(entities): Promise<T[]>; // 非事务
  mutations<T>(map): Promise<T[]>; // RPC 事务

  // 同步引擎
  pullChanges(sinceId, limit?, repositoryFilter?, filter?, branchId?): Promise<RemoteChange[]>;
  pullChangesBatch(requests, limit?, branchIds?): Promise<RemoteChange[]>;
  getChangeCount(sinceId, repositoryFilter?, branchId?): Promise<{ count; latestChangeId }>;
  mergeChanges(actions, branchId?, changes?): Promise<RemoteMergeResult>;

  // 分支
  pushBranches(branches): Promise<{ synced; skipped }>;
  branchExists(branchId): Promise<boolean>;
  pullBranches(): Promise<RemoteBranchInfo[]>;

  // QueryCache
  fetchMetadata(entityName, queryFilter): Observable<QueryCacheEntityMetadata[]>;
  findByIds<T>(entityName, ids): Observable<T[]>;

  isTableExisted(EntityType): Promise<boolean>;
}
```

### SupabaseRepository

```typescript
class SupabaseRepository<T> extends RepositoryBase<T> {
  find(options): Promise<T[]>; // 自动 1000 行分页；始终以 id 兜底排序
  count(options): Promise<number>; // count=exact + head（groupBy 暂不支持）
  create(entity): Promise<T>;
  update(entity, patch): Promise<T>;
  remove(entity): Promise<T>; // 硬删除
}
```

`find` 的 `where` 支持点分关系路径（`orders.amount`）与 `exists`/`notExists`，会自动生成 PostgREST `!inner` 关联过滤。

关系条件的能力边界：

| 写法                      | 支持 | 生成的 PostgREST 构造                    |
| ------------------------- | ---- | ---------------------------------------- |
| `exists`（无 `where`）    | ✅   | `relation=not.is.null`                   |
| `exists` + `where`        | ✅   | `relation!inner(*)` + 嵌套过滤           |
| `notExists`（无 `where`） | ✅   | `relation=is.null`                       |
| `notExists` + `where`     | ❌   | **抛错** —— PostgREST 无法表达 anti-join |

`notExists` 带子条件时会在构造查询阶段抛错，不会发出请求。原因是 PostgREST 的嵌套过滤只裁 embed
出来的子行、不裁父行，`!inner` 又只能表达 EXISTS 而取不到补集 —— 任何客户端拼法给出的都是与请求
语义相反的结果集。需要这个能力时请写服务端 RPC（返回反连接结果的 SQL 函数）后用 `adapter.client.rpc` 调用。

同一层里几条 `exists` / `notExists` 指向同一关系时，每条各用一个嵌入别名（`orders__1`、`orders__2`），彼此独立：`exists(orders, amount = 100) AND exists(orders, amount = 200)` 是「有一笔 100 的订单、也有一笔 200 的订单」，与 SQLite / PGlite 一致。点分关系路径照旧落在以关系名命名的嵌入上，同一关系上的几个点路径条件作用于同一行关联记录。

### SupabaseTreeRepository

```typescript
class SupabaseTreeRepository<T> extends SupabaseRepository<T> {
  findDescendants(options: FindTreeOptions<T>): Promise<T[]>; // 含当前节点
  countDescendants(options: FindTreeOptions<T>): Promise<number>; // 不含当前节点
  findAncestors(options: FindTreeOptions<T>): Promise<T[]>; // 含当前节点
  countAncestors(options: FindTreeOptions<T>): Promise<number>; // 不含当前节点
}
```

`FindTreeOptions.where` 的语义与 sqlite-core 的递归 CTE 一致：

- **起点豁免**：`entityId` 指向的节点（或不指定时的全部根节点）无论是否匹配都返回；
- **递归成员过滤 = 断链**：某一级不匹配时，它下面（祖先方向则是它上面）的整条链都不再展开，
  即使更远处的节点自身匹配也拿不到；
- **`hasChildren` 不受 `where` 影响**：它回答「有没有子节点」，不是「有没有匹配 `where` 的子节点」。

## 同步机制

### 直写事务（`mutations`）

`mutations()` 把新增发到 `p_upserts`，修改发到 `p_updates`，在一个 RPC 事务里执行。修改使用普通 `UPDATE`，不再经过 INSERT 策略；`createdBy` 不下发、保持原值，`updatedBy` 使用当前用户（未设置 `context.userId` 时不注入审计字段，`createdBy` 同样不下发）。

该批量直写路径没有逐列脏追踪：`id` 用于定位，序列化整实体中除 `createdBy` 外的其余列参与更新。推送路径则只发送变更列；两者都只更新载荷中出现的列。`mutations()` 通过 `UPDATE … RETURNING` 将服务器结果与新增行一起返回，调用方可从返回值读取 `updatedAt` 等服务器字段。UPDATE 被策略拒绝报 `42501`，目标行已不存在报 `RX001`；直写批次任一写入失败，整批回滚。

普通单实体修改的 `save()` 经 `EntityManager.update` → `SupabaseRepository.update`，使用 PostgREST 普通 UPDATE；只有需要批量图变更时才走 `mutations()`。现有 `EntityManager.save` 返回原实体，未合并批量 RPC 的返回行；本次只保证 `mutations()` 的返回值，不承诺 `save()` 自动覆盖服务器字段。

返回完整行要求直写角色具备相应列的 SELECT 权限，修改后的行也需满足 SELECT 策略。推送及原 `rxdb_batch_update` 计数入口继续执行不带 RETURNING 的 UPDATE，保留原有权限与可见性语义；不会因本次返回值需求追加全列 SELECT 或修改后行可见性要求。

### Push（`mergeChanges`）

1. 收集本地未推送变更（`remoteId = null`）
2. 变更压缩：`INSERT→UPDATE*` → `INSERT`；`INSERT→DELETE` → 丢弃；`UPDATE*→DELETE` → `DELETE`
3. 调用 RPC `rxdb_mutations`，在单事务内写 `rxdb_change` + 实体表（`p_skip_sync=true`，触发器捕获实际删除，RPC 先写源日志再写隐式级联 DELETE），参数见下表
4. 返回 `maxChangeId` 与 `changeIdMapping`（localId → remoteId）
5. 相同 `(clientId, localId)` 重试时返回首次提交的 remoteId，不重复写 change，也不重复执行实体副作用
6. 全部远端批次成功后，在一个本地事务内同时保存 mapping 和推送水位；本地事务失败时可重试整个未确认批次

`rxdb_mutations` 参数（实体表按 `p_upserts` → `p_updates` → `p_deletes` 顺序执行；非 main 分支三个写数组为空，只写变更记录）：

| 参数          | 形状                                               | 落库方式                                                                                   |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `p_upserts`   | `[{ table, schema, data: [{ id, ...全部列 }] }]`   | 新增实体：`INSERT … ON CONFLICT (id) DO UPDATE`                                            |
| `p_updates`   | `[{ table, schema, data: [{ id, ...修改的列 }] }]` | 修改实体：普通 `UPDATE`，只改出现的列，未出现的列保持原值                                  |
| `p_deletes`   | `[{ table, schema, ids: [...] }]`                  | 删除实体                                                                                   |
| `p_changes`   | `RxDBChange[]`                                     | 写入 `rxdb_change`；`(clientId, localId)` 重复时整批实体操作跳过                           |
| `p_skip_sync` | `boolean`                                          | `true` 时显式变更使用 `p_changes`，触发器捕获实际删除，RPC 在源日志之后统一写入隐式 DELETE |

推送返回对象含 `upserted`（新增行）/ `updated`（修改计数）/ `deleted` / `changes` / `max_change_id` / `change_id_mapping`；直写事务的 `upserted` 另包含修改的服务器行，推送不返回这些修改行。

修改只受目标表的 UPDATE 与 SELECT 策略约束，不受 INSERT 策略约束：owner 型策略下推送不必携带 `owner` 列，共享编辑表上可以改他人创建的行。某条修改更新到 0 行时整批回滚并报错，两类错误的 `DETAIL` 都是 JSON `{"op","schema","table","entityId","reason"}`：

| SQLSTATE | `reason` | 含义                                         |
| -------- | -------- | -------------------------------------------- |
| `42501`  | `denied` | 行仍存在，但调用方的行级权限不允许修改       |
| `RX001`  | `gone`   | 行已不存在（被删除），不会插入残缺行把它复活 |

错误码口径见 [US-220 sqlstate-registry](https://github.com/aiao-io/rxdb/blob/8cc005bb2dda3de51ab0eabb0cdea7e833395c35/specs/006-us220-update-push-semantics/contracts/sqlstate-registry.md)。从旧版本升级须先执行新版 SQL 再升级客户端，见 [迁移说明](https://rxdb.aiao.io/docs/migration/supabase-update-push)。

### 级联删除

推送父行删除后，数据库按 `ON DELETE CASCADE` 实际删除的子行各有一条 DELETE 日志。同批已显式删除的子行沿用客户端日志与 `clientId + localId` 映射，RPC 不再追加重复的隐式日志；显式删除与实际删除按 id 列类型的等值关系配对（与 DELETE 同一判据，uuid 大小写、`numeric` 的 `1` 与 `1.00` 认成同一行），并按分区根表归并，经分区根表或叶分区删除同样只记一条。若子行先被 RLS 拒绝、随后被允许的父删除级联，最终回执按实际结果记为 `applied`。最后一条显式 DELETE 的快照一律取被删行的 `OLD`（客户端 DELETE 的 `inversePatch` 不含 `id`，不能替代），重试成功批次不重复记日志。

触发器先在事务上下文中捕获实际删除；RPC 将隐式 DELETE 追加在客户端源日志之后，统一写入。同批先新增或修改子行、再删父行时，其他端按 INSERT / UPDATE → 隐式 DELETE 的顺序拉取，最终子行不会被较晚的源日志复活；全部日志与业务写一同提交或回滚。

隐式级联日志保留完整 `OLD`（`beforeData`）、空 `afterData` 与 `snapshotComplete = true`，`clientId` / `localId` 为 NULL，因此推送端自己也能拉回子行删除。外键可删除按业务表 RLS 不可见的子行；日志沿用触发器模式现有的读取边界，业务表 RLS 不会自动给变更日志提供逐行授权隔离。

升级本次直写 UPDATE 与级联日志修复时，先在同一数据库事务中按 02 → 04 执行 `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql` 并一起提交，再升级客户端。使用 `psql --single-transaction` 同时传入两个 `-f`；使用 Supabase SQL Editor 时，在同一次执行中以 `BEGIN` / `COMMIT` 包住两份文件的完整内容。不能原子执行时须在维护窗口禁止写入，避免新触发器与旧 RPC 混用。`01-rxdb-system-tables.sql` 无变化；已安装系统表及幂等索引的数据库无需为这两项修复重跑它。完整命令见[迁移说明](https://rxdb.aiao.io/docs/migration/supabase-update-push)。

### Pull（`pullChanges` / `pullChangesBatch`）

1. 以 `id > sinceId` 为游标查询远程变更（用 id 而非时间戳，避免同毫秒重复）
2. 按 `INSERT/UPDATE/DELETE` 应用到本地实体表
3. 写入本地 `rxdb_change` 并标记 `remoteId`，避免回推
4. 更新水位线

### Realtime

监听 `rxdb_change` 的 INSERT，按 `clientId` 过滤掉自身变更，派发 `EntityRemote{Created,Updated,Removed}Event`；通道异常按指数退避（500ms→5s）重连。

## 测试

测试在浏览器环境（Vitest + Playwright Chromium）运行，集成用例需要本地 Supabase（Docker）。

```bash
# 一键：自动起容器 + 初始化 + 跑测试（test 目标 dependsOn: test-env）
pnpm nx test rxdb-adapter-supabase

# 覆盖率
pnpm nx test rxdb-adapter-supabase --coverage

# 用完手动清理（只清理本 checkout 自己起的容器/project，不影响其他 checkout）
pnpm nx run rxdb-adapter-supabase:test-env-down
```

`test-env` 按本 checkout 的绝对路径派生专属的 compose project 名和五个容器名（`docker/supabase-ci-identity.sh`），Kong 端口交给 docker 动态分配后落盘；`test` 目标据此拼 `VITE_SUPABASE_URL`，`VITE_SUPABASE_KEY` 仍取自 `docker/docker-compose.ci.yml`。这样多个 checkout 在同一台机器上并行跑 `test-env` 不会互相撞容器名/端口（RV-036）。容器与初始化脚本见 [docker/](https://github.com/aiao-io/rxdb/tree/main/docker)。

> CI（`.github/actions/supabase/action.yml`）走另一条路径：不设这些环境变量，`docker-compose.ci.yml` 的 `${VAR:-字面量}` 默认值原样生效，固定用 `supabase-db`/`supabase-kong`/`54331` 等字面量，和这里的按 checkout 隔离互不影响。

> 纯单元用例（如 `rule_group_builder` 转义、tree fallback、retry）不依赖网络，可单独运行：
> `pnpm exec vitest run src/__tests__/review-regressions.spec.ts`（需在包目录下）。

## 开发

```bash
pnpm nx build rxdb-adapter-supabase
pnpm nx lint rxdb-adapter-supabase
```

## License

MIT
