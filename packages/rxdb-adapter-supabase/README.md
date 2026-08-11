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

## 快速开始

### 1. 配置 RxDB（本地 wa-sqlite + 远程 supabase）

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
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
await rxdb.versionManager.push(); // 推送本地变更到远程
await rxdb.versionManager.pull(); // 拉取远程变更到本地
await rxdb.versionManager.sync(); // 双向（pull + push）

// 也可按实体粒度同步
await rxdb.versionManager.pushRepository('public', 'Todo');
await rxdb.versionManager.pullRepository('public', 'Todo', { limit: 200 });
await rxdb.versionManager.syncRepository('public', 'Todo');
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

`rxdb_mutations`、`rxdb_batch_upsert` 和 `rxdb_batch_delete` 均以 `SECURITY INVOKER` 执行。调用角色必须拥有目标 schema 的 `USAGE`、目标表所需的 DML 权限及相关 sequence 权限；所有写入同时受该角色的 RLS policy 约束。仅授予 RPC 的 `EXECUTE` 权限不会绕过目标表权限或 RLS，也不要求目标表设置 `FORCE ROW LEVEL SECURITY`。

## 数据库 Schema

适配器依赖两张系统表（**snake_case 表名，camelCase 列名加引号**），完整脚本见 [docker/sql/](https://github.com/aiao-io/aiao/tree/main/docker/sql)。

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

`clientId + localId` 是本地 push 到远端的幂等键。升级既有数据库时应重新执行 `docker/sql/01-rxdb-system-tables.sql` 和 `docker/sql/04-rxdb-utils-functions.sql`；系统表脚本会为每个重复键保留最早的远端 change、删除后续重复记录，再建立部分唯一索引。

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

> Realtime 需把 `rxdb_change` 加入 `supabase_realtime` publication；系统表初始化脚本已处理。
> 同步事务依赖 RPC：`rxdb_mutations`、`rxdb_check_rls`、`rxdb_enable_sync_for_branch`。
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

### Push（`mergeChanges`）

1. 收集本地未推送变更（`remoteId = null`）
2. 变更压缩：`INSERT→UPDATE*` → `INSERT`；`INSERT→DELETE` → 丢弃；`UPDATE*→DELETE` → `DELETE`
3. 调用 RPC `rxdb_mutations`，在单事务内写 `rxdb_change` + 实体表（`p_skip_sync=true` 跳过触发器）
4. 返回 `maxChangeId` 与 `changeIdMapping`（localId → remoteId）
5. 相同 `(clientId, localId)` 重试时返回首次提交的 remoteId，不重复写 change，也不重复执行实体副作用
6. 全部远端批次成功后，在一个本地事务内同时保存 mapping 和推送水位；本地事务失败时可重试整个未确认批次

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
```

测试自动注入环境变量 `VITE_SUPABASE_URL`（`http://localhost:54331`）与 `VITE_SUPABASE_KEY`（取自 `docker/docker-compose.ci.yml`）。容器与初始化脚本见 [docker/](https://github.com/aiao-io/aiao/tree/main/docker)。

> 纯单元用例（如 `rule_group_builder` 转义、tree fallback、retry）不依赖网络，可单独运行：
> `pnpm exec vitest run src/__tests__/review-regressions.spec.ts`（需在包目录下）。

## 开发

```bash
pnpm nx build rxdb-adapter-supabase
pnpm nx lint rxdb-adapter-supabase
```

## License

MIT
