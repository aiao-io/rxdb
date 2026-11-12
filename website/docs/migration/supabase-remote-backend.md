# Supabase 远端身份与远端重置

`@aiao/rxdb-adapter-supabase` 拉取远端变更时，以 `rxdb_change` 的自增 `id` 为游标。这个 `id` 只在同一个库里单调：
库被推倒重建，或者变更日志被 `TRUNCATE ... RESTART IDENTITY` 清空之后，`id` 从头计数，已有客户端的游标会越过新库的全部 `id`：

- 拉取静默返回 0 条，`SyncState` 里没有任何错误；
- 推送照常进行，本地变更被写进一个缺少它们前情的库。

## 修复

远端多了一个身份值，客户端把它和游标存在一起：

- 参考 SQL 新增单行表 `public.rxdb_backend` 与读取函数 `rxdb_backend_id()`。库重建时这张表跟着重建，生成新值；
  `TRUNCATE rxdb_change` 时，触发器 `rxdb_change_rotate_backend_id` 也会换一个新值。
- 本地 `RxDBSync` 新增可空列 `remoteBackendId`（系统表结构 9，连接时自动补列）。第一次与远端交换数据时，
  已有的同步记录绑到远端当前的身份上，之后新建的记录在创建时就带上它。
- `@aiao/rxdb-plugin-sync` 每次与远端交换数据之前先比对。只要有记录绑在别的身份上，同步就停下，本地数据一行不动：
  拉取、推送、待拉计数等入口抛 `RemoteBackendMismatchError`，错误同时写进 `rxdb.syncState` 的 `lastError`，
  三端的 `useSyncState()` 都能读到。
- 同步途中被重建同样停下：拉回的每一轮、推送的回执在落库之前再比对一次，游标与推送水位都不推进。
  前面已经落库的轮次照常算进度，抛出的是 `RxDBPartialSyncError`，`cause` 是 `RemoteBackendMismatchError`。
  分支物化把远端身份与截止 id 一起冻结，首次物化（本地还没有同步记录）也认得出冻结之后的重建。

插件不会自动改绑。远端地址被改到另一个项目时，报的也是这个错误；这时自动改绑，会把别人的数据拉进本地，还会把本地待推变更推过去。

## 恢复

确认新远端就是要同步的那一个之后，显式改绑，再从头拉一遍：

```ts
import { RxDBPartialSyncError } from '@aiao/rxdb';
import { RemoteBackendMismatchError } from '@aiao/rxdb-plugin-sync';

try {
  await rxdb.syncManager.sync();
} catch (error) {
  // 同步途中被重建时，已落库的轮次照常算进度，远端身份错误挂在 RxDBPartialSyncError 的 cause 上
  const cause = error instanceof RxDBPartialSyncError ? error.cause : error;
  if (!(cause instanceof RemoteBackendMismatchError)) throw error;
  // cause.boundBackendIds：本地游标所属的旧身份；cause.backendId：远端此刻的身份
  if (await confirmRemoteReset(cause)) {
    await rxdb.syncManager.rebindRemoteBackend();
    await rxdb.syncManager.pull({ fetchAll: true });
  }
}
```

`rebindRemoteBackend()` 在一个事务里清空所有不属于新远端的拉取游标，并改绑到新身份：

- 下一次拉取从头全量拉；
- 推送水位不动：还没推的本地变更照常推出，已经推到旧远端的不会重推。想把这部分数据放回新远端，属于恢复，不属于同步，请用备份与恢复；
- 改绑成功后，`lastError` 里那条远端身份错误随之清掉。

## 升级

先更新服务端 SQL，再升级客户端。新客户端连到旧版 SQL 时，同步入口会报 `Could not find the function public.rxdb_backend_id`。

依次执行下面三步，每一步都可以重复执行：

1. 建身份表。这一段取自 `docker/sql/01-rxdb-system-tables.sql`，不必重跑整份 01：

   ```sql
   CREATE TABLE IF NOT EXISTS public.rxdb_backend (
     singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
     id uuid NOT NULL DEFAULT gen_random_uuid(),
     "createdAt" timestamptz(3) NOT NULL DEFAULT now()
   );

   INSERT INTO public.rxdb_backend DEFAULT VALUES
   ON CONFLICT (singleton) DO NOTHING;
   ```

2. 重新执行新版 `docker/sql/02-rxdb-sync-functions.sql`，装上 `rxdb_backend_id()` 与轮换触发器。
   02 里的函数引用了这张表，所以要先完成第 1 步：

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/02-rxdb-sync-functions.sql
   ```

3. 重新执行 `docker/sql/production/rxdb-change-grants.sql`，收回 `anon` / `authenticated` 对 `rxdb_backend` 的写权限。
   客户端要是能改这一行，就能让所有客户端误以为远端已重置而停止同步：

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/production/rxdb-change-grants.sql
   ```

执行完后用下面的查询确认，返回一个 uuid 即可：

```sql
SELECT public.rxdb_backend_id();
```

### 本地库

系统表结构从 8 升到 9，连接时自动补列，旧行的 `remoteBackendId` 为空。升级后，旧版本客户端会拒绝打开这个库，
同一个库的多个标签页、窗口要一起升级。

### 自定义远端适配器

`RxDBAdapterRemoteBase` 多了抽象方法 `backendId(): Promise<string>`。返回值在远端重建、变更日志清空并重新计数之后必须改变，
不能用连接地址、项目名这类重建后不变的东西代替。不支持变更日志同步的适配器直接抛不支持错误，不要返回占位值；
`RxDBAdapterHttp` 抛的是 `HttpChangelogUnsupportedError`。

## 有意重置远端

- 推倒重建，或 `TRUNCATE public.rxdb_change`：身份自动换新，已有客户端停下来，等应用改绑；
- 只 `DELETE` 日志、不重置序列：`id` 继续递增，游标仍然有效，身份不变；
- 手工 `ALTER SEQUENCE ... RESTART`：认不出来。确实要这么做时，同时换一个身份：

  ```sql
  UPDATE public.rxdb_backend SET id = gen_random_uuid(), "createdAt" = now() WHERE singleton;
  ```

## 升级之前已经发生的重置

客户端升级后第一次同步时，会把已有的同步记录绑到远端当前的身份上。远端如果在升级之前就重建过，这次重建认不出来，
游标照样越过新库的 `id`；绑定之后再调 `rebindRemoteBackend()` 也不会清游标，因为记录已经属于当前身份。
怀疑某个客户端的游标还停在旧库上时，先确认它的本地变更都已推送，再删掉本地库重新同步，从头拉取一遍。
