# rxdb-adapter-supabase

The RxDB Supabase adapter — a remote sync implementation based on PostgreSQL.

Used as the **remote** adapter of RxDB: read/write locally offline with SQLite
(wa-sqlite / PGlite), and use Supabase remotely for multi-device sync, realtime
push, and cloud backup.

## Features

- ✅ **Complete CRUD** — PostgREST wrapped via `SupabaseRepository`
- ✅ **Batch operations** — `saveMany` / `removeMany` (non-transactional), `mutations` (RPC transaction)
- ✅ **Transaction support** — atomic writes based on the PostgreSQL RPC `rxdb_mutations`
- ✅ **Realtime subscription** — listens for INSERTs on the `rxdb_change` table and dispatches remote events automatically (with exponential-backoff reconnection)
- ✅ **Two-way sync** — `pullChanges` / `mergeChanges` / `pullChangesBatch` with RxDB VersionManager
- ✅ **Tree structures** — `SupabaseTreeRepository` (expands level by level via per-level `select`, depending on no database functions)
- ✅ **RLS self-check** — validates at connect whether target tables have row-level security enabled (configurable `warn` / `throw`)
- ✅ **Transient error retry** — the write/transaction path retries transient errors like gateway timeouts automatically

## When to use

- Multi-device data sync is needed (Web / mobile / desktop)
- Realtime collaboration is needed
- Cloud backup and restore are needed
- Advanced PostgreSQL features are needed (JSONB, full-text search, RLS)
- Supabase infrastructure already exists

## Comparison with other adapters

| Feature               | Supabase        | PGlite     | wa-sqlite |
| --------------------- | --------------- | ---------- | --------- |
| Deployment            | Cloud/self-host | Local      | Local     |
| Multi-device sync     | ✅              | ❌         | ❌        |
| Realtime subscription | ✅              | ❌         | ❌        |
| Offline-first         | ✅ (hybrid)     | ✅         | ✅        |
| Database              | PostgreSQL      | PostgreSQL | SQLite    |
| Auth integration      | ✅              | ❌         | ❌        |

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-supabase @supabase/supabase-js
# Local adapter (either one, or as needed)
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

> peerDependencies: `@aiao/rxdb`, `@supabase/supabase-js` ^2.88, `rxjs` ^7.8.

## Exports

- `RxDBAdapterSupabase` — the remote adapter main class
- `SupabaseRepository` — table-level CRUD / query repository
- `SupabaseTreeRepository` — tree (adjacency list) repository
- `SupabaseAdapterOptions` — the configuration type
- `SupabaseSyncError` / `SupabaseConfigError` / `SupabaseNetworkError` / `SupabaseDataError` — error types
- `ADAPTER_NAME` — the constant `'supabase'`

> ⚠️ No factory functions like `createSupabaseAdapter()` / `createRxdb()` exist; use the classes below with the `rxdb.adapter()` registration approach.

### Division of labor between error types

**When the remote cannot be reached, what is thrown is the core's
`NetworkOfflineError`, not `SupabaseDataError`** — the latter only represents a
refusal given by the remote (RLS, constraints, syntax, etc.). Judge offline
with `@aiao/rxdb`'s `isNetworkError` and don't catch network failures as
`SupabaseDataError`, otherwise the branch won't match when the network is down.

The exported `SupabaseNetworkError` is `@deprecated`; it was never thrown and
must not be used to represent offline.

This is a breaking change relative to earlier versions; migration steps are in
["Supabase transport failure error type migration"](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/supabase-network-errors.md).

## Quick start

### 1. Configure RxDB (local wa-sqlite + remote supabase)

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

// Push/pull sync lives in `@aiao/rxdb-plugin-sync`, which has `inject: ['plugin:history']` — install both;
// without them the `rxdb.syncManager` slot does not exist at all (the core does no fallback).
// Must come before `connect()` — plugins are installed at that moment.
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);

// Register the local adapter
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS', async: true }));

// Register the remote adapter
rxdb.adapter(
  'supabase',
  async db =>
    new RxDBAdapterSupabase(db, {
      supabaseUrl: 'https://your-project.supabase.co',
      supabaseKey: 'your-anon-key'
      // Or reuse an existing client: client: existingSupabaseClient
    })
);

// Connect locally (tables are created automatically)
await rxdb.connect('wa-sqlite');

// Connect remotely (starts the Realtime subscription + RLS self-check)
const supabase = await rxdb.getAdapter('supabase');
await supabase.connect();
```

### 2. Data operations (active-record style)

```typescript
// Create
const todo = new Todo();
todo.title = 'Learn RxDB';
todo.completed = false;
await todo.save();

// Query (local SQLite, reactive)
const todos = await rxdb.repository(Todo).find({
  where: `{ combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }`
});
```

### 3. Sync

```typescript
await rxdb.syncManager.push(); // Push local changes to the remote
await rxdb.syncManager.pull(); // Pull remote changes locally
await rxdb.syncManager.sync(); // Both ways (pull + push)

// Or sync at entity granularity
await rxdb.syncManager.pushRepository('public', 'Todo');
await rxdb.syncManager.pullRepository('public', 'Todo', { limit: 200 });
await rxdb.syncManager.syncRepository('public', 'Todo');
```

## Configuration (`SupabaseAdapterOptions`)

- `supabaseUrl?: string` — the project URL (paired with `supabaseKey`)
- `supabaseKey?: string` — the API key (paired with `supabaseUrl`)
- `client?: SupabaseClient` — reuses an existing client, taking priority over URL+Key
- `rlsCheck?: boolean | SupabaseRlsCheckOptions` — RLS self-check at connect; `false` turns it off; an object can configure `rpcName` / `failureMode` / `tables`

`rlsCheck` default behavior: calls the RPC `rxdb_check_rls` to check whether
entity tables have RLS enabled, and when not enabled **warns but does not
block** (`failureMode: 'warn'`). Set `'throw'` to force-block connections
without RLS in production environments.

```typescript
const adapter = new RxDBAdapterSupabase(rxdb, {
  client,
  rlsCheck: `{ failureMode: 'throw' }`
});
```

In strict mode, a missing target table, RLS not enabled, the RPC response
omitting a target table, a missing check RPC, or a failed check request all
reject `connect()`, and Realtime is not started; later retries re-run the
check. This check only confirms that target tables have RLS enabled; it does
not verify policy contents, auth claims, tenant ownership, or table-level
grants — those still need independent server-side auditing.

`rxdb_mutations`, `rxdb_batch_upsert`, `rxdb_batch_update_rows`,
`rxdb_batch_update`, and `rxdb_batch_delete` all run with `SECURITY INVOKER`.
The calling role must have `USAGE` on the target schema, the DML privileges the
target tables require, and the related sequence privileges; explicit writes are
constrained by that role's RLS policies. Granting only `EXECUTE` on the RPCs
does not bypass target-table privileges or RLS, nor does it require target
tables to set `FORCE ROW LEVEL SECURITY`. Foreign key cascades may delete child
rows invisible to the caller; the log boundary is below under [cascade deletes](#cascade-deletes).

## Database schema

The adapter depends on two system tables (**snake_case table names, camelCase
column names quoted**); the complete scripts are in
[docker/sql/](https://github.com/aiao-io/rxdb/tree/main/docker/sql).

### `rxdb_change` (change records)

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

`clientId + localId` is the idempotency key for local pushes to the remote.
Upgrading from an old database without this index requires running
`docker/sql/01-rxdb-system-tables.sql` as a system-table migration; it keeps
the earliest remote change for each duplicate key, deletes later duplicates,
then creates the partial unique index. This function upgrade also requires
running 02 and 04 inside the same database transaction, see below under
[cascade deletes](#cascade-deletes) and the [migration guide](https://rxdb.aiao.io/docs/migration/supabase-update-push).

### `rxdb_branch` (branch metadata)

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

### Business table column names

- **The physical column names of non-primary-key fields are the property
  names** (camelCase quoted, like `"updatedBy"` or the foreign key
  `"parentId"`). `columnName` declared on properties and relations only applies
  to local adapters; the Supabase remote's reads, writes, filters, ordering,
  and tree queries all access columns by property name.
- **Primary key exception**: the `id` property's `columnName` applies to paths
  that access business tables directly — single-entity `create` / `update` /
  `remove`, `find` / `count`, tree queries, `removeMany`, and QueryCache's
  `fetchMetadata` / `findByIds`.
- **Batch direct writes only support the default `id` primary key column**:
  the payloads of `saveMany` and `mutations` locate rows by the `id` key (the
  `rxdb_mutations` family uses `ON CONFLICT (id)`), and a custom primary key
  column throws `SupabaseConfigError` before any request is issued.
- **The sync protocol binds the business table's `id` column**: the change log
  trigger records `NEW.id`, and `mergeChanges` push also locates rows by the
  `id` key — neither reads the entity primary key's `columnName`. Remote tables
  participating in sync must have their primary key column named `id`;
  entities that only sync and are never read/written directly through this
  adapter may rename the primary key column locally only — local adapters (the
  SQLite family and PGlite) locate rows by the local primary key physical
  column in their change log, pull backfill, and version switching.

> Realtime requires adding `rxdb_change` to the `supabase_realtime`
> publication; the system-table initialization scripts already handle it.
> Sync transactions depend on the RPCs: `rxdb_mutations` (internally calling
> `rxdb_batch_upsert`, `rxdb_batch_update_rows`, `rxdb_batch_delete`,
> `rxdb_existing_ids`), `rxdb_check_rls`, `rxdb_enable_sync_for_branch`,
> `rxdb_backend_id`. `rxdb_batch_update` keeps its original integer-count return value.
>
> `rxdb_backend_id` reads the remote identity from the single-row table
> `rxdb_backend`: after a database rebuild or `TRUNCATE rxdb_change` it gets a
> new value, and when the sync plugin sees it changed it stops sync and reports
> `RemoteBackendMismatchError`. Upgrade steps for existing deployments are in
> the [migration guide](https://rxdb.aiao.io/docs/migration/supabase-remote-backend).
> Tree queries **depend on no database functions**: `SupabaseTreeRepository`
> sends a `select` per level (one `in('parentId', ...)` per level) and expands
> step by step, so deep trees produce round trips proportional to the depth.

## API

### RxDBAdapterSupabase

```typescript
class RxDBAdapterSupabase extends RxDBAdapterRemoteBase {
  constructor(rxdb: RxDB, options: SupabaseAdapterOptions);
  readonly client: SupabaseClient;

  // Connection / lifecycle
  connect(): Promise<IRxDBAdapter>; // RLS self-check + start Realtime
  disconnect(): Promise<void>;
  version(): Promise<string>;

  // Batch
  saveMany<T>(entities): Promise<T[]>; // upsert, non-transactional
  removeMany<T>(entities): Promise<T[]>; // non-transactional
  mutations<T>(map): Promise<T[]>; // RPC transaction

  // Sync engine
  pullChanges(sinceId, limit?, repositoryFilter?, filter?, branchId?): Promise<RemoteChange[]>;
  pullChangesBatch(requests, limit?, branchIds?): Promise<RemoteChange[]>;
  getChangeCount(sinceId, repositoryFilter?, branchId?): Promise<{ count; latestChangeId }>;
  mergeChanges(actions, branchId?, changes?): Promise<RemoteMergeResult>;

  // Branches
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
  find(options): Promise<T[]>; // automatic 1000-row pagination; always falls back to ordering by id
  count(options): Promise<number>; // count=exact + head (groupBy not supported yet)
  create(entity): Promise<T>;
  update(entity, patch): Promise<T>;
  remove(entity): Promise<T>; // hard delete
}
```

`find`'s `where` supports dotted relation paths (`orders.amount`) and
`exists`/`notExists`, and automatically generates PostgREST `!inner` relation filters.

Capability boundaries of relation conditions:

| Form                     | Supported | Generated PostgREST construct                    |
| ------------------------ | --------- | ------------------------------------------------ |
| `exists` (no `where`)    | ✅        | `relation=not.is.null`                           |
| `exists` + `where`       | ✅        | `relation!inner(*)` + nested filters             |
| `notExists` (no `where`) | ✅        | `relation=is.null`                               |
| `notExists` + `where`    | ❌        | **throws** — PostgREST cannot express anti-joins |

`notExists` with sub-conditions throws during query construction and never
issues a request. The reason: PostgREST's nested filters only trim the embedded
child rows, not the parent rows, and `!inner` can only express EXISTS, not the
complement — any client-side composition gives a result set opposite to the
requested semantics. When this capability is needed, write a server-side RPC
(an SQL function returning the anti-join result) and call it via
`adapter.client.rpc`.

When several `exists` / `notExists` in the same level point at the same
relation, each gets its own embed alias (`orders__1`, `orders__2`), independent
of each other: `exists(orders, amount = 100) AND exists(orders, amount = 200)`
means "there is an order of 100, and there is also an order of 200", consistent
with SQLite / PGlite. Dotted relation paths still land on the embed named after
the relation, and several dotted-path conditions on the same relation act on
the same associated record.

### SupabaseTreeRepository

```typescript
class SupabaseTreeRepository<T> extends SupabaseRepository<T> {
  findDescendants(options: FindTreeOptions<T>): Promise<T[]>; // includes the current node
  countDescendants(options: FindTreeOptions<T>): Promise<number>; // excludes the current node
  findAncestors(options: FindTreeOptions<T>): Promise<T[]>; // includes the current node
  countAncestors(options: FindTreeOptions<T>): Promise<number>; // excludes the current node
}
```

The semantics of `FindTreeOptions.where` are the same as sqlite-core's recursive CTE:

- **Start exemption**: the node pointed at by `entityId` (or all root nodes
  when unspecified) is returned whether or not it matches;
- **Recursive member filter = chain break**: when a level does not match, the
  whole chain below it (above it in the ancestor direction) is no longer
  expanded, even if nodes further away match on their own;
- **`hasChildren` is unaffected by `where`**: it answers "are there child
  nodes", not "are there child nodes matching `where`".

## Sync mechanism

### Direct-write transactions (`mutations`)

`mutations()` sends inserts to `p_upserts` and modifications to `p_updates`,
executing in one RPC transaction. Modifications use ordinary `UPDATE`, no
longer going through the INSERT strategy; `createdBy` is not sent and keeps its
original value, and `updatedBy` uses the current user (when `context.userId` is
not set no audit fields are injected, and `createdBy` is likewise not sent).

This batch direct-write path has no per-column dirty tracking: `id` is used for
locating, and the serialized whole entity participates in the update except for
`createdBy`. The push path only sends changed columns; both only update the
columns present in the payload. `mutations()` returns server results together
with inserted rows via `UPDATE … RETURNING`, so callers can read server fields
like `updatedAt` from the return value. An UPDATE rejected by policy reports
`42501`, a target row that no longer exists reports `RX001`; any write in the
direct-write batch failing rolls back the whole batch.

A normal single-entity modification's `save()` goes through
`EntityManager.update` → `SupabaseRepository.update`, using PostgREST's ordinary
UPDATE; only batch graph changes go through `mutations()`. The existing
`EntityManager.save` returns the original entity and does not merge the batch
RPC's returned rows; this change only guarantees `mutations()`'s return value
and does not promise that `save()` automatically covers server fields.

Returning complete rows requires the direct-write role to have SELECT privilege
on the corresponding columns, and the modified rows must also satisfy the
SELECT policy. The push and the original `rxdb_batch_update` count entries
continue to run UPDATE without RETURNING, keeping the original privilege and
visibility semantics; no full-column SELECT or post-modification row
visibility requirement is added because of this return value requirement.

### Push (`mergeChanges`)

1. Collect local unpushed changes (`remoteId = null`)
2. Change compression: `INSERT→UPDATE*` → `INSERT`; `INSERT→DELETE` → discard; `UPDATE*→DELETE` → `DELETE`
3. Call the RPC `rxdb_mutations`, writing `rxdb_change` + entity tables in one
   transaction (`p_skip_sync=true`, triggers capture the actual deletes, and
   the RPC writes the source log first and then the implicit cascade DELETEs);
   parameters are in the table below
4. Return `maxChangeId` and `changeIdMapping` (localId → remoteId)
5. Retrying the same `(clientId, localId)` returns the first commit's remoteId,
   neither writing a duplicate change nor repeating the entity side effects
6. After all remote batches succeed, save the mapping and the push waterline in
   one local transaction; when the local transaction fails, the whole unacknowledged batch can be retried

`rxdb_mutations` parameters (entity tables run in the order `p_upserts` →
`p_updates` → `p_deletes`; for non-main branches the three write arrays are
empty and only change records are written):

| Parameter     | Shape                                                     | Landing approach                                                                                                                                   |
| ------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p_upserts`   | `[{ table, schema, data: [{ id, ...all columns }] }]`     | New entities: `INSERT … ON CONFLICT (id) DO UPDATE`                                                                                                |
| `p_updates`   | `[{ table, schema, data: [{ id, ...changed columns }] }]` | Modified entities: ordinary `UPDATE`, only changing the columns present; absent columns keep their original values                                 |
| `p_deletes`   | `[{ table, schema, ids: [...] }]`                         | Deleted entities                                                                                                                                   |
| `p_changes`   | `RxDBChange[]`                                            | Written into `rxdb_change`; on duplicate `(clientId, localId)` the whole batch's entity operations are skipped                                     |
| `p_skip_sync` | `boolean`                                                 | When `true`, explicit changes use `p_changes`, triggers capture actual deletes, and the RPC writes implicit DELETEs uniformly after the source log |

The push return object contains `upserted` (inserted rows) / `updated`
(modification count) / `deleted` / `changes` / `max_change_id` /
`change_id_mapping`; the direct-write transaction's `upserted` additionally
contains the modified server rows, which push does not return.

Modifications are constrained only by the target table's UPDATE and SELECT
policies, not the INSERT policy: under an owner-style policy push need not
carry the `owner` column, and rows created by others can be modified on
shared-edit tables. When an update affects 0 rows the whole batch rolls back
and errors, and the `DETAIL` of both error kinds is the JSON
`{"op","schema","table","entityId","reason"}`:

| SQLSTATE | `reason` | Meaning                                                                                |
| -------- | -------- | -------------------------------------------------------------------------------------- |
| `42501`  | `denied` | The row still exists, but the caller's row-level privilege does not allow modifying it |
| `RX001`  | `gone`   | The row no longer exists (deleted); a partial row is never inserted to resurrect it    |

Error code semantics are in [US-220 sqlstate-registry](https://github.com/aiao-io/rxdb/blob/8cc005bb2dda3de51ab0eabb0cdea7e833395c35/specs/006-us220-update-push-semantics/contracts/sqlstate-registry.md).
Upgrading from an old version requires running the new SQL first and then
upgrading the client, see the [migration guide](https://rxdb.aiao.io/docs/migration/supabase-update-push).

### Cascade deletes

After pushing a parent row deletion, each child row the database actually
deletes per `ON DELETE CASCADE` gets one DELETE log. Child rows explicitly
deleted in the same batch reuse the client log and the `clientId + localId`
mapping, and the RPC appends no duplicate implicit log; explicit deletes and
actual deletes are paired by the id column type's equality relation (the same
criterion as DELETE — uuid case and `numeric`'s `1` vs `1.00` count as the same
row), and merged by the partitioned root table; deleting via the partitioned
root table or a leaf partition also logs only once. If a child row is first
rejected by RLS and then deleted by an allowed parent's cascade, the final
receipt records `applied` per the actual result. The snapshot of the last
explicit DELETE always takes the deleted row's `OLD` (the client DELETE's
`inversePatch` contains no `id` and cannot substitute), and retried successful
batches don't log again.

Triggers first capture actual deletes in the transaction context; the RPC
appends implicit DELETEs after the client source log, writing uniformly. When
the same batch first inserts or modifies a child row and then deletes the
parent, other devices pull in the order INSERT / UPDATE → implicit DELETE, and
the child row is ultimately not resurrected by the later source log; all logs
commit or roll back together with the business writes.

Implicit cascade logs keep the complete `OLD` (`beforeData`), empty `afterData`,
and `snapshotComplete = true`, with NULL `clientId` / `localId`, so the pushing
device itself can also pull the child row deletion back. Foreign keys can
delete child rows invisible under the business table's RLS; the log follows the
existing read boundary of the trigger pattern, and business-table RLS does not
automatically provide per-row authorization isolation to the change log.

When upgrading this direct-write UPDATE and the cascade log fix, first run
`docker/sql/02-rxdb-sync-functions.sql` and
`docker/sql/04-rxdb-utils-functions.sql` in the order 02 → 04 inside the same
database transaction and commit them together, then upgrade the client. Use
`psql --single-transaction` passing both `-f` options; in the Supabase SQL
Editor wrap the complete contents of both files in `BEGIN` / `COMMIT` in one
execution. When atomic execution is impossible, writes must be forbidden during
a maintenance window to avoid mixing the new triggers with the old RPC.
`01-rxdb-system-tables.sql` is unchanged; databases with the system tables and
the idempotent index already installed need not re-run it for these two fixes.
Complete commands are in the [migration guide](https://rxdb.aiao.io/docs/migration/supabase-update-push).

### Pull (`pullChanges` / `pullChangesBatch`)

1. Query remote changes with `id > sinceId` as the cursor (using id instead of
   timestamps avoids duplicates within the same millisecond)
2. Apply to local entity tables per `INSERT/UPDATE/DELETE`
3. Write into the local `rxdb_change` and mark `remoteId` to avoid pushing back
4. Update the waterline

### Realtime

Listens for INSERTs on `rxdb_change`, filters out its own changes by
`clientId`, and dispatches `EntityRemote{Created,Updated,Removed}Event`;
channel failures reconnect with exponential backoff (500ms→5s).

## Testing

Tests run in a browser environment (Vitest + Playwright Chromium); integration
cases need a local Supabase (Docker).

```bash
# One shot: automatically starts containers + initializes + runs tests (the test target has dependsOn: test-env)
pnpm nx test rxdb-adapter-supabase

# Coverage
pnpm nx test rxdb-adapter-supabase --coverage

# Manual cleanup when done (only cleans the containers/project started by this checkout, not affecting other checkouts)
pnpm nx run rxdb-adapter-supabase:test-env-down
```

`test-env` derives a dedicated compose project name and five container names
from this checkout's absolute path (`docker/supabase-ci-identity.sh`), with the
Kong port dynamically assigned by docker and written to disk; the `test` target
composes `VITE_SUPABASE_URL` from it, while `VITE_SUPABASE_KEY` still comes
from `docker/docker-compose.ci.yml`. This way multiple checkouts running
`test-env` in parallel on the same machine never collide on container
names/ports (RV-036). Containers and initialization scripts are in
[docker/](https://github.com/aiao-io/rxdb/tree/main/docker).

> CI (`.github/actions/supabase/action.yml`) takes another path: these
> environment variables are not set, the `${VAR:-literal}` defaults in
> `docker-compose.ci.yml` apply as-is, and fixed literals like
> `supabase-db`/`supabase-kong`/`54331` are used, independent of the
> per-checkout isolation here.

> Purely unit cases (like `rule_group_builder` escaping, tree fallback, retry)
> don't need the network and can run alone:
> `pnpm exec vitest run src/__tests__/review-regressions.spec.ts` (must run in
> the package directory).

## Development

```bash
pnpm nx build rxdb-adapter-supabase
pnpm nx lint rxdb-adapter-supabase
```

## License

MIT

## Classes

| Class                                                                                   | Description                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [RxDBAdapterSupabase](classes/RxDBAdapterSupabase.md)                                   | The Supabase adapter                                                                                    |
| [SupabaseConfigError](classes/SupabaseConfigError.md)                                   | Configuration error                                                                                     |
| [SupabaseDataError](classes/SupabaseDataError.md)                                       | Data error                                                                                              |
| [~~SupabaseNetworkError~~](classes/SupabaseNetworkError.md)                             | Network error                                                                                           |
| [SupabaseRepository](classes/SupabaseRepository.md)                                     | Supabase Repository — provides CRUD operations on Supabase tables                                       |
| [SupabaseSyncError](classes/SupabaseSyncError.md)                                       | The base class of Supabase sync errors                                                                  |
| [SupabaseTreeRepository](classes/SupabaseTreeRepository.md)                             | Supabase Tree Repository — provides query operations on tree structures                                 |
| [SupabaseUnsupportedPropertyTypeError](classes/SupabaseUnsupportedPropertyTypeError.md) | The configuration error thrown when the Supabase remote encounters an unsupported entity property type. |

## Interfaces

| Interface                                                          | Description                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [SupabaseAdapterOptions](interfaces/SupabaseAdapterOptions.md)     | Supabase Adapter configuration options                                                          |
| [SupabaseDataErrorOptions](interfaces/SupabaseDataErrorOptions.md) | The fields [SupabaseDataError](classes/SupabaseDataError.md) keeps from the database error body |
| [SupabaseRlsCheckOptions](interfaces/SupabaseRlsCheckOptions.md)   | -                                                                                               |
| [SupabaseRlsCheckTable](interfaces/SupabaseRlsCheckTable.md)       | -                                                                                               |

## Variables

| Variable                                                    | Description                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [ADAPTER\_NAME](variables/ADAPTER_NAME.md)                  | -                                                                                                                         |
| [SUPABASE\_SDK\_VERSION](variables/SUPABASE_SDK_VERSION.md) | The minimum supported @supabase/supabase-js version this adapter is based on (aligned with package.json peerDependencies) |
