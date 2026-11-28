# Supabase adapter

`@aiao/rxdb-adapter-supabase` provides integration with a [Supabase](https://supabase.com/) backend, enabling bidirectional sync between local data and the cloud database, realtime subscriptions, and transactional batch operations.

:::warning bigint / binary do not support remote sync
The Supabase adapter currently does not support remote CRUD,
push, pull, RPC, or Realtime for `PropertyType.bigint` or `PropertyType.binary`. When an entity actually bound to a Supabase remote contains these fields, `connect()`
fails fast before any network request; bypassing the connection check and accessing that remote Repository directly also fails immediately.

bigint/binary entities that only use local adapters can coexist with other Supabase-synced entities and do not block the whole
database connection.
:::

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-supabase @supabase/supabase-js
```

## Core concepts

### Change tracking

All data changes are recorded in a single `RxDBChange` table (rather than per entity); each record contains:

- `namespace` / `entity` / `entityId` — identify the changed entity
- `type` — `INSERT` / `UPDATE` / `DELETE`
- `patch` / `inversePatch` — forward and inverse patches (for undo)
- `clientId` — identifier of the client that initiated the change (for filtering out its own changes)
- `createdAt` / `updatedAt` — in a pushed write's log, `createdAt` is the change's local edit time and `updatedAt` is the push time.
  The puller's LWW conflict resolution compares `createdAt` against the edit time of its own pending pushes; both sides must be the same kind of time

### Sync cursor

Uses the auto-incrementing `id` of the `RxDBChange` table as the sync cursor (rather than timestamps), avoiding duplicates when several changes land in the same millisecond.

The auto-increment `id` is assigned at write time and only visible to other sessions at commit. So that the cursor never skips rows, the reference SQL attaches a statement-level trigger
`rxdb_change_serialize_append` to `rxdb_change`: every log-writing transaction first takes the same transaction-level advisory lock and holds it until commit, so a later-committed change is guaranteed a larger `id`.
Without this lock, a transaction that took its `id` first but committed later would be permanently skipped by pullers that already passed it — silently.

The cost is that log-writing transactions queue from the first log write to commit:

- Push writes its logs only after the business write completes, so only the tail end queues;
- a long transaction writing business tables directly keeps blocking push, and push fails when the calling role's `statement_timeout` is exceeded, resending on the next sync round;
- a multi-statement direct-write transaction and a push touching the same row may deadlock; PostgreSQL aborts one of them (SQLSTATE `40P01`) and the adapter's write retry resends the aborted push.

The cursor is only valid within one database: after the database is torn down and rebuilt, or after `rxdb_change` is `TRUNCATE`d, `id` counts from the start again and an old cursor skips past every `id` of the new database.
So the remote also carries an identity value: the `id` of the single-row table `rxdb_backend`, read through `rxdb_backend_id()` (the adapter's `backendId()`).
Rebuilding the database rebuilds this table and generates a new value; `TRUNCATE rxdb_change` rotates it via the trigger `rxdb_change_rotate_backend_id`.
The sync plugin `@aiao/rxdb-plugin-sync` stores it together with the cursor, and on mismatch stops syncing and reports `RemoteBackendMismatchError`; see [Sync strategy](../collaboration/sync.md#remote-reset).

### QueryCache mode

`fetchMetadata` only pulls `{id, updatedAt}` for freshness comparison, and dirty data is then pulled in full through `findByIds` — cutting data transfer by 90%+.

Under this strategy Supabase is the single source of truth: writes go through `create` / `update` / `delete` straight to the remote, and only on success is the local cache updated;
the local side **records no `RxDBChange`**, so there is no push phase and no undo/redo or conflict resolution. Rows deleted on the remote are cleared locally on the next
sync of that `where`. Configuration and call surface: [Sync strategy · QueryCache quick start](../collaboration/sync.md#querycache-quick-start).

## Basic usage

### Option 1: pass URL + key

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

### Option 2: pass an existing client

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://your-project.supabase.co', 'your-anon-key');

rxdb.adapter('supabase', db => {
  return new RxDBAdapterSupabase(db, { client: supabase });
});
```

:::tip Client first
When `client` is passed, `supabaseUrl` and `supabaseKey` are ignored. Recommended for projects that already have a Supabase client, to avoid creating multiple instances.
:::

## Configuration options

```typescript
interface SupabaseAdapterOptions extends IRxDBAdapterOptions {
  /** Supabase project URL */
  supabaseUrl?: string;

  /** Supabase API key (usually the anon key) */
  supabaseKey?: string;

  /** An existing Supabase client instance (takes priority over URL + key) */
  client?: SupabaseClient;

  /**
   * Run the RLS self-check on connect.
   * By default it calls the `rxdb_check_rls` RPC and logs a warning when it finds tables without RLS enabled.
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

### RLS self-check

`connect()` by default tries to call the `rxdb_check_rls` RPC, checking whether the current RxDB business tables have Row Level Security enabled.

- If the RPC is installed and finds a table without RLS enabled, it logs a warning.
- To block misconfiguration outright in development or CI, set `rlsCheck: { failureMode: 'throw' }`.
- If your environment guarantees RLS itself, set `rlsCheck: false` to skip this step.

The SQL install scripts in the repository already include `rxdb_check_rls(jsonb)`; it takes effect after the database initialization script is synced.

## Realtime sync

Through Supabase Realtime the adapter subscribes to `INSERT` events on the `RxDBChange` table, providing cross-client realtime sync:

- When the subscription state becomes `CHANNEL_ERROR`, `TIMED_OUT`, or `CLOSED`, the adapter reconnects automatically with exponential backoff.
- After a successful resubscription, the backoff counter resets and the pullable count is recomputed from each repository's watermark.
- The channels created together (the shared channel plus one per bucket) request that recount once, after every one of them has reported its subscription outcome, not once per channel. A channel that later rejoins on its own requests its own recount. Each recount checks the remote identity once and calls `rxdb_entity_sync_infos` and `rxdb_pending_change_counts` once; see [Sync status RPCs](#sync-status-rpcs).

```
Client A modifies data
    │
    ▼
Write entity tables + RxDBChange table (via the rxdb_mutations RPC)
    │
    ▼
Supabase Realtime broadcasts the INSERT event
    │
    ▼
Client B receives the change
    │
    ├── clientId === its own? → ignore (avoid echo)
    │
    └── clientId !== its own? → dispatch Remote events
         ├── INSERT → EntityRemoteCreatedEvent
         ├── UPDATE → EntityRemoteUpdatedEvent
         └── DELETE → EntityRemoteRemovedEvent
```

### Connect and disconnect

```typescript
// Start the realtime subscription
await rxdb.connect('supabase');

// Tear down the subscription
await rxdb.disconnect('supabase');
```

## RPC functions

The adapter depends on the following PostgreSQL functions (created in advance in the Supabase database):

### rxdb_mutations

Transactional batch operation writing entity tables and the change table together:

```typescript
// Internal call shape
const { data } = await client.rpc('rxdb_mutations', {
  p_upserts: [{ table: 'todos', schema: 'public', data: [...] }],
  p_updates: [{ table: 'todos', schema: 'public', data: [{ id, completed: true }] }],
  p_deletes: [{ table: 'todos', schema: 'public', ids: [...] }],
  p_changes: [...],        // RxDBChange records
  p_skip_sync: true         // triggers capture actual deletes; the RPC writes implicit DELETEs after the source logs in one go
});
```

| parameter     | type      | description                                                                                                                                    |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `p_upserts`   | `json[]`  | new entities grouped by table (all columns), `INSERT … ON CONFLICT DO UPDATE`                                                                  |
| `p_updates`   | `json[]`  | modified entities grouped by table (`id` + modified columns), plain `UPDATE`                                                                   |
| `p_deletes`   | `json[]`  | ids to delete, grouped by table                                                                                                                |
| `p_changes`   | `json[]`  | change records (written into the RxDBChange table)                                                                                             |
| `p_skip_sync` | `boolean` | whether explicit changes use `p_changes`; triggers capture actual deletes, and the RPC writes implicit DELETEs after the source logs in one go |

Entity tables execute in the order `p_upserts` → `p_updates` → `p_deletes`. The returned object's `upserted` array contains the inserted rows; direct-write transactions (`p_skip_sync = false`) additionally contain the modified server rows, while push does not return modified rows. `updated` / `deleted` are counts; push also returns the change-id mapping, and with push receipts enabled additionally per-entity results.

#### Update semantics

Local modifications push as plain `UPDATE`: only the columns present in the payload change, others keep the remote values; they are constrained only by the target table's UPDATE and SELECT policies, not the INSERT policy. So under an owner-style policy, pushes need not carry the `owner` column, and rows created by others can be modified on a table open for shared editing.

`mutations()` also sends modifications through `p_updates`. This bulk direct-write path uses serialized whole entities with no per-column dirty tracking: `id` locates the row, `createdBy` is not sent, the remaining present columns participate in the UPDATE, and `updatedBy` is injected with the current user. The server returns the rows actually written via `UPDATE … RETURNING`, and callers can read server fields such as `updatedAt` from the `mutations()` return value; inserts still go through `p_upserts`.

Ordinary single-entity `save()` goes through `EntityManager.update` → `SupabaseRepository.update` and performs a plain PostgREST UPDATE as before; `mutations()` is only for bulk graph changes. The existing `EntityManager.save` discards the bulk RPC's return value and returns the original entity; this behavior is unchanged here, and `save()` does not promise to auto-merge server fields.

`rxdb_batch_update_rows` executes the UPDATE as `SECURITY INVOKER` and returns rows; the direct-write role needs SELECT permission on the returned columns, and the modified rows must also satisfy the SELECT policy. Push and the original `rxdb_batch_update` count entry keep using UPDATE without RETURNING, preserving the existing column-permission and RLS visibility semantics — no new full-column SELECT or modified-row visibility requirements are introduced for this return value.

An update affecting 0 rows throws — no silent skip, no partial row inserted:

| SQLSTATE | `details.reason` | meaning                                                                                |
| -------- | ---------------- | -------------------------------------------------------------------------------------- |
| `42501`  | `denied`         | the row still exists, but the caller's row-level permissions do not allow modifying it |
| `RX001`  | `gone`           | the row no longer exists (deleted)                                                     |

Both errors carry JSON-text `details` with keys `op` / `schema` / `table` / `entityId` / `reason`; `message` starts with `rxdb:`. Direct-write `mutations()` throws `SupabaseDataError` and rolls back the whole batch. Whether push fails the whole batch or returns per-entity rejections depends on whether [push receipts](../migration/supabase-push-receipts.md) are enabled.

Distinguishing "rejected" from "no longer exists" relies on the existence probe `rxdb_existing_ids` (`SECURITY DEFINER`, only accepting tables with RxDB sync triggers attached), which answers "do these ids exist" bypassing row-level permissions and returns no column values. See [Supabase update push semantics migration](../migration/supabase-update-push.md) for upgrading from older versions.

Every `p_changes` in a local push carries `clientId` and `localId`, which together form the remote idempotency key. The database must have the partial unique indexes from `docker/sql/01-rxdb-system-tables.sql` installed and use the same version of `rxdb_mutations`: on a pure retry batch the RPC returns the first commit's remoteId and skips duplicate entity upserts/deletes. The upgrade script keeps the earliest change per duplicate key, deletes the later duplicates, and only then creates the unique index.

#### Logging cascade deletes

With `p_skip_sync = true`, the sync triggers capture the actual DELETE inside the transaction context. The RPC first orders the client's `p_changes` in source order, then appends logs for child rows deleted by `ON DELETE CASCADE` but not explicitly sent, writing them all into `rxdb_change`. Each implicit delete gets its own log with `clientId` / `localId` NULL, so even the client that pushed the parent delete can pull the child-row deletions back; the full `OLD` is kept in `beforeData`, with `afterData = null` and `snapshotComplete = true`.

Source logs come before implicit DELETEs. When the same batch inserts or modifies a child and then deletes the parent, other clients pull INSERT / UPDATE → implicit DELETE, and the child row ends up absent. The RPC preserves array order and writes both parts in one go, committing or rolling back both log parts with the business writes in the same transaction.

Child rows explicitly deleted in the same batch keep the client log and id mapping; the trigger only captures `OLD` to avoid duplicate logs. Explicit deletes pair with actual deletes by equality on the id column type (the same criterion as DELETE: uuid case, `numeric` `1` vs `1.00` count as the same row), and merge by partition root table, so deleting via the partition root table or a leaf partition still logs exactly once. If a row is first rejected by a row-level policy and then cascaded by an allowed parent delete, the final receipt follows the actual delete and is recorded as `applied`; the last explicit DELETE's snapshot always takes the actual delete's `OLD` — the client DELETE's `inversePatch` has no `id` and cannot substitute. Retrying a successful batch skips the entity side effects, and implicit logs are not produced twice.

Foreign key actions can delete child rows the caller cannot see under the business tables' RLS. The added logs reuse the existing trigger pattern's full snapshot and readable scope and may contain all columns of the child row. Business-table RLS does not automatically give the logs per-row authorization isolation; the logs' read policy must be designed separately around the application's data boundaries.

### Sync status RPCs

The sync plugin's status queries (`syncManager.getAllRepositorySyncStatus()` and the pullable-count recount after a Realtime resubscription) ask the remote once per round, however many repositories there are. `pull()` likewise asks for the registrations once at the start (US-236):

| function                     | parameters                            | purpose                                                                                                                                                   |
| ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb_entity_sync_infos`     | `p_entities jsonb`                    | registrations of several entities in one call, in request order; each item is what `rxdb_entity_sync_info` returns                                        |
| `rxdb_pending_change_counts` | `p_probes jsonb, p_branch_ids text[]` | for several repositories (bucketed entities per bucket), the log rows after the cursor on the given branches that this client did not push (`excludeIds`) |

Both are `SECURITY INVOKER` and granted to `anon` and `authenticated`: the count runs under the change log's RLS, so anon only counts readable buckets and never the unbucketed log, and a bucket revoked mid-way counts 0. Custom remote adapters may skip the matching `getEntitySyncInfos` / `countPendingChanges`; the sync plugin then asks one repository at a time and gets the same numbers.

### Tree query RPCs

| function               | parameters           | purpose                                    |
| ---------------------- | -------------------- | ------------------------------------------ |
| `get_descendants`      | `root_id, max_level` | recursive CTE query of descendants         |
| `get_root_descendants` | `max_level`          | query all root nodes and their descendants |
| `get_ancestors`        | `node_id, max_level` | recursive CTE query of ancestors           |

## Pull/push sync

### Pulling changes

```typescript
// Pull remote changes by cursor
const changes = await adapter.pullChanges(sinceId, limit);
```

- Uses `RxDBChange.id` (auto-increment) as the cursor
- Supports `repositoryFilter` to filter by entity
- Supports `filter` (RuleGroup) for row-level filtering
- Returns `RemoteChange[]`, ordered by `id ASC`

### Merging changes

```typescript
// Transactional double write: entity tables + RxDBChange table
const maxChangeId = await adapter.mergeChanges(actions);
```

Parses the `entityKey` format `namespace:entity:entityId` and implements atomicity through the `rxdb_mutations` RPC.

## Relation queries

Through PostgREST's nested query syntax the adapter supports automatic JOINs of related data:

| relation type      | supported | example                                |
| ------------------ | --------- | -------------------------------------- |
| many-to-one (m:1)  | ✅        | `order.customer`                       |
| one-to-one (1:1)   | ✅        | `user.profile`                         |
| one-to-many (1:m)  | ✅        | `customer.orders`                      |
| many-to-many (m:n) | ✅        | `post.tags` (through a junction table) |

### Nested WHERE queries

Query related entities' properties through dot paths:

```typescript
// Find customers with an order amount > 100
const customers = await Customer.find({
  where: {
    'orders.amount': { $gt: 100 }
  }
});
```

## Query operator mapping

| RxDB operator           | PostgREST mapping                |
| ----------------------- | -------------------------------- |
| `=` / `!=`              | `eq` / `neq`                     |
| `<` / `<=` / `>` / `>=` | `lt` / `lte` / `gt` / `gte`      |
| `in` / `notIn`          | `.in()` / `.not('in')`           |
| `contains`              | `ilike.*value*`                  |
| `startsWith`            | `ilike.value*`                   |
| `endsWith`              | `ilike.*value`                   |
| `between`               | `.gte().lte()`                   |
| `null` / `notNull`      | `.is(null)` / `.not('is', null)` |
| `exists` / `notExists`  | related-table `!inner` JOIN      |

## Error handling

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
    // configuration error: invalid URL or key
  } else if (error instanceof SupabaseNetworkError) {
    // network error: cannot connect to Supabase
  } else if (error instanceof SupabaseDataError) {
    // data error: type conversion failure etc.
  }
}
```

| error type             | code                                     | scenario                                                                                 |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SupabaseConfigError`  | `CONFIG_ERROR`                           | invalid URL/key configuration                                                            |
| `SupabaseNetworkError` | `NETWORK_ERROR`                          | network connection failure                                                               |
| `SupabaseDataError`    | the database error code, or `DATA_ERROR` | remote rejection (RLS, constraints, row no longer exists, etc.), non-conforming response |

When the remote returns a database error, `SupabaseDataError.code` is that error code (SQLSTATE such as `42501`, `RX001`; or PostgREST's `PGRST*`),
`details` is the database's `DETAIL`, and `HINT` is appended into `message`; data errors without an error code (wrong response shape, type conversion failure) have `code` `DATA_ERROR`.

## Data type conversion

Data returned from Supabase is converted automatically:

| property type                          | conversion rule                         |
| -------------------------------------- | --------------------------------------- |
| `date`                                 | `string → Date`                         |
| `boolean`                              | `Boolean(value)`                        |
| `keyValue`                             | nested properties converted recursively |
| `json` / `stringArray` / `numberArray` | kept as-is                              |

`bigint` and `binary` are not in the remote conversion table. To preserve the original types and exact values, configure the corresponding entities as
local-only and use the SQLite family or PGlite; do not bypass the validation with string/base64 fallbacks.

## Performance optimization

1. **Use the QueryCache mode**: `fetchMetadata` only transfers `{id, updatedAt}`, drastically reducing network traffic
2. **Batch operations**: use `saveMany()` / `removeMany()` instead of per-row operations to reduce HTTP requests
3. **Transactional double write**: `mutations()` completes everything in one RPC call, guaranteeing atomicity
4. **Cursor sync**: based on auto-increment ids rather than timestamps, avoiding duplicate pulls

## Production deployment

### Make log id order equal commit order

Existing deployments just re-run `docker/sql/02-rxdb-sync-functions.sql` once to install the `rxdb_change_serialize_append` trigger;
no client upgrade needed, `01-rxdb-system-tables.sql` does not need a re-run. Changes already missed before the upgrade are not backfilled automatically; see the [migration guide](../migration/supabase-change-log-order.md).

### Install the remote identity

Existing deployments first create the `rxdb_backend` table, then re-run the new `docker/sql/02-rxdb-sync-functions.sql` and the production permission script, and finally upgrade the client.
A new client connecting to a database without `rxdb_backend_id()` gets `Could not find the function public.rxdb_backend_id` at the sync entry. Full steps in the [migration guide](../migration/supabase-remote-backend.md).

When resetting the remote on purpose, tearing it down and rebuilding, or `TRUNCATE public.rxdb_change`, both rotate the identity automatically; existing clients stop and wait for the app to rebind.
Only `DELETE`ing logs without resetting the sequence keeps the cursor valid and the identity unchanged; a manual `ALTER SEQUENCE ... RESTART` is not detectable — rotate an identity at the same time.

### Install the batched sync status RPCs

Existing deployments run the new `docker/sql/02-rxdb-sync-functions.sql`, their own `rxdb_caller_buckets` override, and the production permission script in one transaction to install `rxdb_entity_sync_infos` and `rxdb_pending_change_counts` ([Sync status RPCs](#sync-status-rpcs)), then upgrade the client. 02 resets `rxdb_caller_buckets()` to the platform default, so the override goes before the permission script. Old clients do not call the two functions and keep syncing; a new client against old SQL gets `Could not find the function public.rxdb_entity_sync_infos` from status queries and pulls. Full steps in the [migration guide](../migration/supabase-sync-status-batch.md).

### Update the UPDATE and cascade-delete functions

Databases with existing system tables and idempotency indexes: first run the new `docker/sql/02-rxdb-sync-functions.sql` and `docker/sql/04-rxdb-utils-functions.sql` in the same database transaction in 02 → 04 order and commit together, then upgrade the client. The former updates DELETE capture; the latter updates UPDATE row returns and unified delete-log writes; the two must go together and must not be committed separately under write traffic.

Use `psql --single-transaction` with both `-f`s; in the Supabase SQL Editor, wrap the complete contents of both files in `BEGIN` / `COMMIT` in one execution. If the tool cannot execute atomically, block business writes in a maintenance window until both scripts are deployed. `01-rxdb-system-tables.sql` is unchanged in this release and needs no re-run for these two fixes; upgrading from even earlier versions still must satisfy the original system-table and push-receipt migration prerequisites. Full commands in the [migration guide](../migration/supabase-update-push.md).

### Tighten change-log write permissions

The base SQL `docker/sql/01-rxdb-system-tables.sql` and `03-business-tables.sql` grant `anon` / `authenticated` via `GRANT ALL ON ALL TABLES IN SCHEMA public`, and the change log table `public.rxdb_change` is among them. After the base SQL, run the production permission script once more:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/production/rxdb-change-grants.sql
```

The script does four things:

- revokes `anon` / `authenticated`'s `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` on `rxdb_change`;
- revokes `USAGE` / `UPDATE` on the sequence `rxdb_change_id_seq`;
- keeps `SELECT`. The pull function `rxdb_pull_changes` is `SECURITY INVOKER` and reads the logs under the caller's identity; Realtime also delivers the logs' `INSERT` events under the caller's identity. Revoking `SELECT` would break both pull and realtime sync at once;
- revokes `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` on the remote identity table `rxdb_backend`, keeping `SELECT`. A client able to modify this row could make every client misjudge a remote reset and stop syncing; reads go through `rxdb_backend_id()`, and rotation only through the `TRUNCATE rxdb_change` trigger, both `SECURITY DEFINER`.

The script can be re-run. Any script containing `GRANT ALL ON ALL TABLES IN SCHEMA public` (such as `docker/sql/01-rxdb-system-tables.sql`) loosens the permissions back when re-run, so always run this script after them — hence it is always last. The repository's development initialization script (`docker/init-db.sh`) and the CI Supabase environment both load it after 01–04, keeping development and production on the same footing; the repository's Supabase tests provision and clean up `rxdb_change` via the `service_role` identity, with `anon` read-only.

After tightening, only two write paths remain for the logs:

| write path                                                              | how the log is written                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| push `rxdb_mutations`                                                   | triggers capture the actual DELETE, and the RPC appends implicit logs after the source logs, writing them all through the internal function `rxdb_insert_changes` (`SECURITY DEFINER`); on the main branch, source logs must pair with the same batch's entity writes, otherwise `RX002` |
| direct writes to business tables (`mutations()`, `p_skip_sync = false`) | written by the sync trigger function `rxdb_log_change_trigger` (`SECURITY DEFINER`)                                                                                                                                                                                                      |

Clients writing `rxdb_change` directly via PostgREST get `42501 permission denied for table rxdb_change`. Calling `rxdb_insert_changes` directly also gets `42501` (`rxdb: rxdb_insert_changes may only be called by rxdb_mutations`): it only recognizes the guard set by `rxdb_mutations` within the same transaction, and clients cannot pre-set that guard.

### Recommended business-table RLS policies

`rxdb_mutations` is `SECURITY INVOKER` — pushes land under the caller's identity, and the business tables' row-level security policies directly decide which changes can be written. Write one policy per operation rather than one `FOR ALL` covering everything:

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

Why separate:

- Update pushes are plain `UPDATE`, constrained only by the UPDATE and SELECT policies (see [Update semantics](#update-semantics)). A `FOR ALL`'s `WITH CHECK` constrains both newly inserted rows and modified rows, and cannot relax modification separately.
- Combinations like "read-only, no modification" and "modify but not delete" are only expressible with separate policies.

`connect()` checks by default whether business tables have RLS enabled; see [RLS self-check](#rls-self-check).

What happens when a push is rejected by policy depends on the database and client versions:

| version                                                  | behavior                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client does not send `p_receipts` (before push receipts) | whole batch rolls back: throws `SupabaseDataError` with `code` `42501` (rejected) or `RX001` (row no longer exists); the watermark does not advance and the whole batch stays pending                                                                                                          |
| both client and database support push receipts           | per-entity handling: rejected entities get `rejectedAt` and `rejection` written and are not pushed again; other entities in the batch land as usual; the rejected list is exposed via `syncState.lastRejections`, see [Rejected pushes](../plugins/rxdb-plugin-sync/README.md#rejected-pushes) |

See [Supabase push receipts migration](../migration/supabase-push-receipts.md) for the two version combinations and the upgrade order.

### Known limitations in production deployment

- **Non-main branch logs are still writable**: when pushing a non-main branch, `rxdb_mutations` only writes logs and no entities, so there are no entity writes to pair with. These logs never enter main-branch pulls, but callers can still write logs into any non-main branch.
- **`rxdb_branch` is not tightened**: the branch table remains open for client reads and writes; the production permission script does not touch it.
- **Existence probe**: `rxdb_existing_ids`'s remaining probe surface is in [Known limitations](#known-limitations) below. ids should not carry sensitive information.
- **Log read scope**: cascade deletes keep the full `OLD` snapshot even when the caller cannot see the child rows under the business tables' RLS. The log table's authorization and pull rules must be designed separately; do not rely on the business tables' RLS to isolate automatically.

## Troubleshooting

### RPC function does not exist

```
ERROR: function rxdb_mutations does not exist
```

Make sure the required RPC functions (`rxdb_mutations`, `get_descendants`, etc.) have been created in the Supabase database.

A new client against old SQL reports on push `Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_skip_sync, p_updates, p_upserts)`: update the new 02 and 04 in one transaction per the [migration guide](../migration/supabase-update-push.md), then retry.

The sync entry reports `Could not find the function public.rxdb_backend_id`: the database has no remote identity yet; create the table and re-run 02 per the [remote identity migration guide](../migration/supabase-remote-backend.md).

Status queries or pulls report `Could not find the function public.rxdb_entity_sync_infos` (or `rxdb_pending_change_counts`, code `PGRST202`): the server does not have the two batched status functions yet. Update 02 and the production permission script per the [migration guide](../migration/supabase-sync-status-batch.md); if it still fails after deploying, run `NOTIFY pgrst, 'reload schema';` to refresh PostgREST's schema cache.

### Sync reports RemoteBackendMismatchError

The local cursor belongs to another remote: the remote was torn down and rebuilt, `rxdb_change` was `TRUNCATE`d, or `supabaseUrl` was changed to another project. Sync stops in place; local data is untouched.
After confirming the new remote is the one to sync with, call `rxdb.syncManager.rebindRemoteBackend()` then `pull({ fetchAll: true })`; when the address was misconfigured, change it back instead of rebinding.

### Realtime receives no changes

1. Confirm the Supabase project has Realtime enabled
2. Confirm the `RxDBChange` table was added to the Realtime Publication
3. Check whether the RLS (Row Level Security) policies allow reading

If the startup log says `RLS self-check skipped because RPC "rxdb_check_rls" is not installed`, the database has not applied the latest `04-rxdb-utils-functions.sql` yet.

### clientId conflicts

If multiple tabs use the same `clientId`, changes get wrongly filtered. Make sure each client instance has a unique `clientId`.

## Known limitations

- **Existence probe**: `rxdb_existing_ids` bypasses row-level permissions to answer whether certain ids exist in synced tables. In the reference deployment `rxdb_change` itself is readable by `anon`, so the probe strictly leaks less than that; but if you tightened `rxdb_change`'s read permission yourself, the probe is the remaining existence channel. ids should not carry sensitive information: UUID primary keys are unenumerable, while auto-increment or business primary keys can be probed one by one. Non-synced tables (such as `auth.users`) always refuse probing.
