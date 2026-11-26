# Sync strategies

RxDB supports flexible synchronization between local and remote data. Configure the `sync` option to get anything from fully offline to real-time sync.

```ts
import { RxDB, SyncType } from '@aiao/rxdb';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [...],
  sync: {
    type: SyncType.None,          // Strategy type
    local: { adapter: 'wa-sqlite' }, // Local storage (optional)
    // remote: { adapter: 'xxx' } // Remote storage (optional)
  }
});
```

## Strategy types

| Strategy     | Data flow | Use case                |
| :----------- | :-------- | :---------------------- |
| `None`       | One-way   | Offline apps            |
| `Full`       | Two-way   | Complete offline access |
| `Filter`     | Two-way   | Conditional filtering   |
| `QueryCache` | On demand | Caching huge datasets   |

:::tip Recommended setup
For apps that need offline access, use `SyncType.Full` for two-way data sync.
:::

## Full sync quick start

`SyncType.Full` is the most common strategy, for apps that need complete offline access.

### Basic setup

Push/pull sync is not in core; install two plugins:

```bash
pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync
```

`@aiao/rxdb-plugin-sync` declares `inject: ['plugin:history']` — the history plugin is a hard prerequisite for it to become active: finishing a round trip must invalidate undo boundaries and settle pending-pull counts, and those states live on the history side. Without the history plugin the sync plugin does not install, so the `rxdb.syncManager` slot does not exist.

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [Todo, User],
  sync: {
    type: SyncType.Full,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'supabase' }
  }
});

// Register adapters
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
rxdb.adapter(
  'supabase',
  db =>
    new RxDBAdapterSupabase(db, {
      supabaseUrl: 'YOUR_SUPABASE_URL',
      supabaseKey: 'YOUR_SUPABASE_KEY'
    })
);

// Register plugins. Order does not matter: the host sorts them topologically by `inject`, so the history plugin always finishes first
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);

await rxdb.connect('wa-sqlite');
```

Pass the **plugin factory function itself** to `use()` — do not call it (`rxdb.use(rxDBPluginSync)`, not `rxdb.use(rxDBPluginSync())`).

### Running sync

Sync entry points live on `rxdb.syncManager`, assembled by the sync plugin within the connection epoch — **available only after `await connect()`**.

```ts
const sync = rxdb.syncManager;

// Two-way sync for a single repository
const result = await sync.syncRepository('public', 'Todo');
console.log(`Pulled: ${result.pullResult.pulled}, pushed: ${result.pushResult.pushed}`);

// Batch-sync all repositories
const bulkResult = await sync.bulkSync();
console.log(`Synced ${bulkResult.results.length} repositories`);

// Pull remote data only
await sync.syncRepository('public', 'Todo', { direction: 'pull' });

// Push local changes only
await sync.syncRepository('public', 'Todo', { direction: 'push' });
```

:::warning Migrating from `versionManager`
Sync methods used to live on `rxdb.versionManager`; they have all moved to `rxdb.syncManager`. `versionManager` still exists but only keeps history and branch APIs. See [History and sync split](../migration/history-sync-plugins.md) for a comparison table.
:::

### Conflict resolution

When a pull or sync detects that unpushed local changes and remote changes hit the same entity, the system runs conflict detection first, then applies **Last Write Wins (LWW)** by default:

- Compare the edit moments on both sides (the change's `createdAt`); the later edit wins. Locally, the entity's last unpushed change is taken; remotely, the push author's edit moment is taken — the Supabase adapter stores it verbatim in `rxdb_change.createdAt` and keeps the push moment separately in `updatedAt`, so a side that pushes after being offline for a long time cannot override others' later edits with its push time
- When the edit moments are equal, the two sides' `clientId` decides in lexicographic order; independent decisions on each side converge to the same result
- The two moments come from different devices' clocks: a device with a fast clock has an advantage in conflicts — a limitation of LWW itself

The runtime applies two outcomes automatically:

- `KEEP_LOCAL`: skip the remote patch and keep the local pending changes
- `KEEP_REMOTE`: apply the remote patch and mark the conflicting local changes as overwritten by the remote

If a custom resolver returns `MERGE` or `DEFER`, the runtime throws and emits a pending-conflict event, avoiding silently dropping remote changes when there is no persisted conflict state.

```ts
import { LWWConflictResolver, type Conflict, type ConflictResolution, type ConflictResolver } from '@aiao/rxdb';

// Settings-like data follows the remote; everything else uses LWW
class SettingsFollowRemote implements ConflictResolver {
  readonly #lww = new LWWConflictResolver();

  async resolve(conflict: Conflict): Promise<ConflictResolution> {
    if (conflict.entityKey.startsWith('public:Settings:')) return { type: 'KEEP_REMOTE' };
    return this.#lww.resolve(conflict);
  }
}

const result = await rxdb.syncManager.syncRepository('public', 'Todo', {
  pull: {
    conflictResolver: new SettingsFollowRemote()
  }
});
```

### Remote reset

The pull cursor is an auto-increment id into the remote change log, only valid within one remote database. After the remote is rebuilt — or its change log cleared and re-counted — an old cursor would skip past all ids in the new database. To catch this, remote adapters provide an identity value (`backendId()`); the sync plugin stores it with the cursor in the same `RxDBSync` record and compares before every exchange with the remote:

- On a mismatch, `pull` / `push` / `sync`, each per-repository entry point, `bulkSync`, `syncBranches`, and the pending-pull count all throw `RemoteBackendMismatchError`; the same error is written to `rxdb.syncState`'s `lastError`, and local data is untouched;
- A rebuild mid-sync also stops the run: every pulled page and every push receipt is compared again before being committed. On a mismatch the run stops; neither the cursor nor the push watermark advances, and the batch already sent to the new database is pushed again from the old watermark next time. Pages committed before the mismatch still count as progress — the error thrown then is `RxDBPartialSyncError`, with `RemoteBackendMismatchError` as its `cause`;
- When switching to a remote branch that only has metadata, materialization freezes the remote identity together with the cutoff id, compared before resuming the pull and after every page. On a mismatch the switch fails with `BranchNotMaterializedError` (`reason` = `source_failed`, `cause` = `RemoteBackendMismatchError`); retrying after a rebind freezes against the new remote;
- No automatic rebind: pointing the remote address at another project raises the same error. Once you confirm the new remote is the one to sync with, call `rxdb.syncManager.rebindRemoteBackend()` — pull cursors not belonging to the new remote are cleared and the next pull fetches everything from scratch; the push watermark is untouched, so local changes already pushed to the old remote are not re-pushed.

```ts
import { RxDBPartialSyncError } from '@aiao/rxdb';
import { RemoteBackendMismatchError } from '@aiao/rxdb-plugin-sync';

try {
  await rxdb.syncManager.sync();
} catch (error) {
  const cause = error instanceof RxDBPartialSyncError ? error.cause : error;
  if (!(cause instanceof RemoteBackendMismatchError)) throw error;
  if (await confirm('The remote was rebuilt. Re-pull everything from the new remote?')) {
    await rxdb.syncManager.rebindRemoteBackend();
    await rxdb.syncManager.pull({ fetchAll: true });
  }
}
```

For Supabase server setup and the upgrade steps for existing deployments, see [remote identity migration](../migration/supabase-remote-backend.md).

### Listening to sync events

```ts
import { SYNC_COMPLETE_EVENT, SYNC_ERROR_EVENT } from '@aiao/rxdb';

// Sync completed
rxdb.addEventListener(SYNC_COMPLETE_EVENT, event => {
  console.log(`${event.direction} sync completed:`, event.result);
});

// Sync failed
rxdb.addEventListener(SYNC_ERROR_EVENT, event => {
  console.error(`${event.direction} sync failed:`, event.error);
});

// Conflict detected
rxdb.addEventListener('CONFLICT_DETECTED', event => {
  console.log('Auto-resolved conflicts:', event.resolved, 'pending conflicts:', event.deferred);
});
```

## Filter sync quick start

`SyncType.Filter` is for conditionally filtered sync — for example, syncing only the last 30 days of data.

### Basic setup

```ts
import { Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';
import { subDays } from 'date-fns';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'updatedAt', type: PropertyType.date }
  ],
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'wa-sqlite' },
    remote: {
      adapter: 'supabase',
      // Dynamic filter: only sync the last 30 days
      filter: () => ({
        combinator: 'and',
        rules: [{ field: 'updatedAt', operator: '>=', value: subDays(new Date(), 30) }]
      })
    }
  }
})
export class Todo extends EntityBase {}
```

:::info The filter function
`filter` is a function returning a `RuleGroup`; it **runs again on every pull**. This means:

- Rolling time windows update automatically ("last 30 days" moves with time)
- The filter can adapt to runtime state dynamically
  :::

### Running sync

```ts
const sync = rxdb.syncManager;

// Pull: fetch only remote data matching the filter
await sync.syncRepository('public', 'Todo', { direction: 'pull' });

// Push: local changes push without restrictions
await sync.syncRepository('public', 'Todo', { direction: 'push' });

// Two-way sync (pull is restricted, push is not)
await sync.syncRepository('public', 'Todo');
```

### Cleaning up expired data

With a rolling time window, local data may stop matching the filter and become "expired". Clean it up with `cleanupExpired`:

```ts
const sync = rxdb.syncManager;

// Delete local data that no longer matches the filter
const result = await sync.cleanupExpired('public', 'Todo');
console.log(`Cleaned up ${result.removed} expired records`);

// Preview mode: only return what would be deleted, without deleting
const preview = await sync.cleanupExpired('public', 'Todo', { dryRun: true });
console.log(`Would clean up ${preview.removed} records:`, preview.removedIds);
```

### Complex filters

```ts
// Combined conditions: last 30 days AND not archived
sync: {
  type: SyncType.Filter,
  local: { adapter: 'wa-sqlite' },
  remote: {
    adapter: 'supabase',
    filter: () => ({
      combinator: 'and',
      rules: [
        { field: 'updatedAt', operator: '>=', value: subDays(new Date(), 30) },
        { field: 'archived', operator: '=', value: false }
      ]
    })
  }
}
```

### Filter vs Full

| Aspect        | Full sync                        | Filter sync                             |
| ------------- | -------------------------------- | --------------------------------------- |
| Pull scope    | All data                         | Only matching data                      |
| Push scope    | All data                         | All data (unrestricted)                 |
| Local storage | Complete dataset                 | A subset                                |
| Use case      | Small datasets, complete offline | Large datasets, only recent data needed |

## QueryCache quick start

`SyncType.QueryCache` is for datasets **far larger than local storage can hold**, where repeated queries should still hit locally. Its fundamental difference from Full / Filter: **the remote is the single source of truth, and local storage is only a cache**.

### Basic setup

```ts
import { RxDB, SyncType } from '@aiao/rxdb';

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Product],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'supabase' }
  }
});

const repo = rxdb.entityManager.getRepository(Product);

// The exact same call surface as other strategies: Promise / entity instances / limit / offset / orderBy
const rows = await repo.find({
  where: { combinator: 'and', rules: [{ field: 'categoryId', operator: '=', value: 'c-1' }] },
  limit: 20,
  offset: 0
});
```

### What happens on one find

1. `fetchMetadata(where)` fetches all `{ id, updatedAt }` for the rows the query hits, from the remote;
2. At the same time, the local projection for this `where` is read to get the rows already stored locally;
3. The two sides are compared and split into four kinds: **missing** (not local), **stale** (local `updatedAt` is older), **fresh**, **orphans** (local but no longer remote);
4. Orphans are deleted locally; missing + stale are fetched via `findByIds` and written locally;
5. The result is read from the local row repository with the full query options; `limit` / `offset` / `orderBy` are pushed down into SQL.

### Behavior differences from other strategies

| Behavior                | Full / Filter                                        | QueryCache                                                                                                                                                                                                                                                  |
| :---------------------- | :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth         | Local (offline writes allowed)                       | Remote (writes allowed locally while offline, replayed when back online)                                                                                                                                                                                    |
| Write path              | Write locally, push with sync                        | Write remote first, update the local cache only after success; on a remote business error (401, validation, ...) the local side is untouched; when the network is unreachable, the write lands locally and queues, then replays over REST verbs once online |
| Local changelog         | Recorded (enables undo/redo and conflict resolution) | **Not recorded** while the remote is reachable; offline queuing uses a separate outbound queue (reusing `rxdb_change`, replayed by `@aiao/rxdb-plugin-sync`)                                                                                                |
| Remote deletions        | Delivered through the change stream                  | Cleared locally as orphans during sync                                                                                                                                                                                                                      |
| Local data completeness | Complete dataset / subset                            | Only the union of the `where`s queried so far                                                                                                                                                                                                               |

:::warning Sync granularity is `where`, not `limit`
`fetchMetadata` operates on the whole `where`: `limit: 20` does not make sync process only 20 rows.
Narrow the result set with `where`; narrowing with `limit` causes fetch amplification. Watch the degree of amplification with `onSyncStats`.
:::

### Sync memory (`syncStaleTime`)

Since sync granularity is the whole `where`, paging only changes `limit` / `offset` — the second page of the same `where` should not re-validate against the remote. `sync.local.syncStaleTime` (milliseconds, default `1000`) is that "just synced" memory window: repeated reads of the same `where` inside the window read the local projection directly, so one paging interaction causes exactly one sync.

```ts
sync: {
  type: SyncType.QueryCache,
  local: { adapter: 'wa-sqlite', syncStaleTime: 5000 },
  remote: { adapter: 'supabase' }
}
```

The window only **defers** re-validation, never cancels it: the memory goes stale immediately when the window expires, when this entity gets a write, or when the adapter reconnects. Set `0` to disable the memory entirely and go back to "validate against the remote on every read".

### Cache-first and offline fallback

```ts
const rows = await repo.find({
  where,
  // Hand out the local cache first; remote validation runs in the background and lands locally (stale-while-revalidate)
  localCacheFirst: true,
  // On network failure, degrade to reading the local cache; without local data, throw NetworkOfflineError
  offlineFallback: true,
  onSyncStats: stats => {
    // remoteCount is the total remote rows hit by the where — use it to judge fetch amplification
    console.log(stats.remoteCount, stats.pulledCount, stats.durationMs);
  }
});
```

`localCacheFirst` can also be set as a default in `sync.local.localCacheFirst`; a per-call value wins.

`offlineFallback` **swallows only network failures** (connection failures, DNS, timeouts). Business errors — 401, unique key conflicts, field validation failures, anything with an HTTP status code — propagate unchanged and are never silently replaced with a stale cache.

### Adapter capability requirements

Both adapters must implement the QueryCache-required methods: local `getMetadataByIds` / `upsertMany` / `deleteByIds`, remote `fetchMetadata` / `findByIds`. They are `abstract` when extending the adapter base classes, so the compiler guarantees them; a custom adapter object missing any of them makes repository construction throw `RxDBQueryCacheCapabilityError`, listing the missing method names.

### Column contract for remote rows

**Every row returned by `findByIds` must carry every non-nullable column of the local table, with a non-null value** — including `createdAt` / `updatedAt` declared by `EntityBase`. This contract holds for all QueryCache remotes (HTTP, Supabase, self-built services), because it comes from the **landing path**, not from a protocol.

"Carried" is judged by **value**, not just by key: `{ createdAt: null }` is rejected exactly like omitting `createdAt`. A nullable remote column, or a join that comes up empty, produces exactly that first shape from `select('*')`. Both end up hitting the same `NOT NULL` — `null` binds into the parameter as-is, while `undefined` makes the INSERT omit the column entirely — so the contract treats them the same, only splitting the message into two columns: "column missing" tells the remote to send the column; "key present but value empty" tells you to check why the remote returned `null`.

The reason is that `upsertMany` is raw SQL that bypasses the repository:

```ts
// The entity declares a default — but it is a **repository-layer** thing
{ name: 'createdAt', type: PropertyType.date, default: () => new Date() }
```

A function-form `default` contributes nothing to `CREATE TABLE`; on the local table `createdAt` is plain `NOT NULL`. QueryCache's pulled rows land without going through the repository, so a remote omitting this column → INSERT omits the column → the database rejects it.

Columns that may be omitted — the part that holds **for both local backends**:

- Nullable columns (`nullable: true`);
- Columns with a **literal** `default` — it becomes the `DEFAULT` clause of the DDL. **Except `binary`**: table creation explicitly skips defaults of this type, so the column stays bare `NOT NULL`;
- `integer` primary keys (SQLite's `AUTOINCREMENT` / PostgreSQL's `serial` both generate them).

Foreign key columns of relations (`ONE_TO_ONE` / `MANY_TO_ONE`) are physical columns on the local table and must also be carried, but the exemption rules differ from ordinary columns: nullable ones may be omitted; a literal `default` **only works for `MANY_TO_ONE`** — the DDL's `DEFAULT` clause is inside the `kind === MANY_TO_ONE` branch, so a one-to-one column is created with only `NOT NULL`, and letting it pass would make "validated rows" get rejected by the database at INSERT time.

#### Two backend-dependent cases

The test computes "which columns does the **local backend's table-creation DDL** make NOT NULL with no default available", and the two backends' creation rules disagree in two cases:

| Case                                                                          | SQLite family (wa-sqlite / sqlite-wasm / sqliteai / desktop)                      | PGlite                                                                             |
| :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| `uuid` (and `string` / `bigint`) primary key                                  | **May be omitted**: table creation sends `DEFAULT (lower(hex(randomblob(16))))`   | **Must be carried**: table creation sends only `"id" uuid PRIMARY KEY`, no default |
| Relation column with `onDelete` / `onUpdate` `SET NULL` and `nullable: false` | **May be omitted**: the DDL downgrades the column to nullable, no `NOT NULL` sent | **Must be carried**: the DDL only looks at `nullable` and sends `NOT NULL`         |

The first row is a **genuine DDL difference**: SQLite can stuff a random default into a non-integer primary key, while PostgreSQL has no equivalent spelling. **Remotes for PGlite must supply primary key values themselves**; if you want one remote implementation that works with both backends, follow the PGlite column — it is the stricter side.

The second row is different — it is a **known PGlite table-creation defect, not a designed backend difference**. On the same table, `NOT NULL` contradicts `ON DELETE SET NULL`: deleting the parent row makes PostgreSQL set the column to null, which the column's `NOT NULL` forbids, so deleting the parent is guaranteed to fail. The SQLite side downgrades such columns to nullable precisely to avoid this. The contract's job is to **truthfully reflect the current DDL of this backend**, not to correct it, so today the column still gets `NOT NULL` and the contract still requires it — but this cell will become "may be omitted" once PGlite table creation is fixed, relaxing in the lenient direction without breaking existing remote implementations.

#### Three ways to spell a key

Everything else must be supplied. Validation and the landing path **share the same spelling table** (each package's `queryCacheForeignKeyColumns`), so "spellings validation accepts" and "spellings the landing path understands" match character for character:

- **Property name / relation name**: `nickName`, `owner`;
- **Physical column name**: `nick_name`, `owner_id` (what a remote gets back from `select('*')`);
- Relation columns additionally accept the **foreign key alias**: `ownerId`.

All three spellings are fully equivalent for the same foreign key column; the landing path always translates them to the physical column name `owner_id`.

:::warning One column, one spelling
Using two spellings for the same column in one row (`ownerId` and `owner_id`, or `nickName` and `nick_name`) is rejected **consistently by both backends** — never silently pick one: when the two values differ, which one lands depends on key enumeration order, with no signal at all — SQLite does not even error on duplicate column names; it keeps the first and drops the second, leaving a "successfully written" wrong value in the database. Send each column exactly once per remote row.
:::

#### Uniform column set within a batch: SQLite family only

On the SQLite family side, rows within one batch must also have a **uniform column set**. A heterogeneous batch (row 1 carries `tag`, row 2 does not) is rejected: it generates one INSERT per batch, and rows missing a key would bind as `NULL`, **silently nulling out** nullable columns. The PGlite side **has no such requirement** — it groups the batch by column set, one INSERT per group, so missing keys never appear in the column list at all.

When the contract fails, **both backends** throw `RxDBQueryCacheRowContractError` **before** landing anything (same-named class per package, `name` and message skeleton identical character for character), naming the entity, the missing columns, and the cause — and **not a single row of the batch is written**; no transaction is even opened.

:::warning Missing columns are not patched with defaults
Filling in `new Date()` produces the **moment this machine pulled the row**, not the moment the record was created: two devices pulling the same row would get different `createdAt`, and the difference only surfaces in cross-device comparison. A missing column is a problem in the backend or the protocol implementation — patching it here would dress it up as success.
:::

## Instance-level overrides (`syncOverrides`)

The same entity class can follow different strategies in different `RxDB` instances. The typical case is a domain module shared between frontend and backend: the browser goes through HTTP per the decorator-declared QueryCache, while the Node backend is the authoritative database and needs the same class purely locally.

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { Recipe } from '@modules/recipes-domain'; // Decorator declares QueryCache + http

const server = new RxDB({
  dbName: 'recipes-server',
  entities: [Recipe],
  sync: { type: SyncType.None, local: { adapter: 'pglite' } },
  syncOverrides: [{ entity: Recipe, sync: { type: SyncType.None, local: { adapter: 'pglite' } } }]
});
```

**Priority**: instance override > entity decorator `sync` > library-level `sync`.

**Whole replacement, not deep merge**: an override entry's `sync` is the entity's complete configuration in this instance — nothing of the decorator's `remote`, adapter names, or cache options (like `syncStaleTime`) survives.

**This instance only**: an override neither rewrites the entity class's metadata nor freezes the object the caller passed in — a snapshot is taken at construction, and later mutations of the passed entry do not affect a running or reconnected instance. Another instance registering the same class follows its own configuration as usual.

**The effective configuration is read-only**: the overridden entity's `repository.sync` and `rxdb.entitySync.resolve(Entity)` return this instance's frozen snapshot; assigning to it at runtime throws `TypeError`. To change strategy, rebuild the instance with new `syncOverrides` — do not mutate configuration objects at runtime.

**Adapters are not switched**: adapters are registered only from the library-level `sync`. Every side an override declares must have a same-named adapter registered at the library level; an override with a missing side or a different name is rejected at construction, leaving no adapter stream that would never emit.

**The effective configuration drives validation**: an override whose `remote` is not registered at the library level fails at construction with `invalid-sync`; fail-fast errors such as a missing plugin for QueryCache or an adapter that does not support the mode fire according to the effective, overridden configuration; an entity overridden to purely local needs neither a remote adapter nor entry into the outbound replay and cache-refresh pipelines.

Invalid entries throw `RxDBSyncOverrideError` before entity bindings are established and before any database write; discriminate by `reason`:

| `reason`        | Meaning                                                                                                                                                                                                                                                                                                                  |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unregistered`  | The target is not in this instance's `entities` (including auto-generated relation junction entities)                                                                                                                                                                                                                    |
| `system-entity` | The target is a system table injected by RxDB or a plugin                                                                                                                                                                                                                                                                |
| `duplicate`     | Multiple overrides for the same entity                                                                                                                                                                                                                                                                                   |
| `invalid-entry` | `syncOverrides` is not an array, the array has holes (sparse), an entry is not an object, or `entity` is not an entity class                                                                                                                                                                                             |
| `invalid-sync`  | `sync` is `null`, missing, or has a wrong `type`, or adapter option shapes are wrong; Full / Filter / QueryCache missing a side; Filter's `remote.filter` missing or not a function (the return value is checked only at pull time); an override-declared side has no same-named adapter registered at the library level |

:::tip Plugin authors
Always read an entity's strategy through `rxdb.entitySync.resolve(Entity)` / `resolveType(Entity)`; do not read `getEntityMetadata(Entity).sync` directly — the latter is the decorator's raw value and does not see instance overrides.
:::

## Relation queries and sync

**Core rule**: foreign keys may point from local to anywhere, never from remote to local.

### Query routing rules

The query engine picks the query path automatically, based on **the tables the query conditions touch** and **where each table is stored**:

| Query conditions                  | Primary table location | Related table location | Query path |
| --------------------------------- | ---------------------- | ---------------------- | ---------- |
| Primary table properties only     | Local                  | -                      | Local      |
| Primary table properties only     | Remote                 | -                      | Remote     |
| Primary table properties only     | Synced                 | -                      | Local      |
| Includes related table properties | Local                  | Local                  | Local      |
| Includes related table properties | Local                  | Remote                 | Remote     |
| Includes related table properties | Local                  | Synced                 | Local      |
| Includes related table properties | Remote                 | Local                  | ❌         |
| Includes related table properties | Remote                 | Remote                 | Remote     |
| Includes related table properties | Remote                 | Synced                 | Remote     |
| Includes related table properties | Synced                 | Local                  | Local      |
| Includes related table properties | Synced                 | Remote                 | Remote     |
| Includes related table properties | Synced                 | Synced                 | Local      |

**Rule summary**:

1. **Primary table properties only**: prefer local (synced tables go local)
2. **Includes related table properties**: any table remote → query remote
3. **Remote primary + local related**: not feasible (violates the foreign key rule)

```ts
// Example: Article (synced) relates to Author (remote)

// Primary table properties only → local query
repository.find({ where: { title: 'Hello' } });

// Includes related table properties → remote query
repository.find({
  where: { author: { name: 'Alice' } },
  relations: ['author']
});
```

---

### Primary table: local-only

#### One-to-many (primary 1 ← related N, foreign key on the related side)

| Related table strategy | Feasible | Why                                           |
| ---------------------- | -------- | --------------------------------------------- |
| Local-only             | ✅       | Foreign key is local; can reference local     |
| Remote-only            | ❌       | Foreign key is remote; cannot reference local |
| Full sync              | ❌       | Foreign key is remote; cannot reference local |
| Filtered sync          | ❌       | Foreign key is remote; cannot reference local |
| Query cache            | ❌       | Foreign key is remote; cannot reference local |

**Example**: local `User` ← remote `Article` **not feasible** (the remote cannot store the local user id).

#### Many-to-one (related N → primary 1, foreign key on the related side)

The current entity is the related side; the primary table's strategy:

| Primary table strategy | Feasible | Why                                        |
| ---------------------- | -------- | ------------------------------------------ |
| Local-only             | ✅       | Foreign key is local; can reference local  |
| Remote-only            | ✅       | Foreign key is local; can reference remote |
| Full sync              | ✅       | Foreign key is local; can reference remote |
| Filtered sync          | ✅       | Foreign key is local; can reference remote |
| Query cache            | ✅       | Foreign key is local; can reference remote |

**Example**: local `Article` → remote `User` **feasible** (local can store the remote user id).

#### One-to-one (foreign key on either side)

| Related table strategy | Foreign key location | Feasible | Why                                           |
| ---------------------- | -------------------- | -------- | --------------------------------------------- |
| Local-only             | Either               | ✅       | Both local                                    |
| Remote-only            | Local                | ✅       | Foreign key is local; can reference remote    |
| Remote-only            | Remote               | ❌       | Foreign key is remote; cannot reference local |
| Full sync              | Local                | ✅       | Foreign key is local; can reference remote    |
| Full sync              | Remote               | ❌       | Foreign key is remote; cannot reference local |
| Filtered sync          | Local                | ✅       | Foreign key is local; can reference remote    |
| Filtered sync          | Remote               | ❌       | Foreign key is remote; cannot reference local |
| Query cache            | Local                | ✅       | Foreign key is local; can reference remote    |
| Query cache            | Remote               | ❌       | Foreign key is remote; cannot reference local |

#### Many-to-many (junction table stores both ids)

| Related table strategy | Junction table location | Feasible | Why                                        |
| ---------------------- | ----------------------- | -------- | ------------------------------------------ |
| Local-only             | Local                   | ✅       | Both local                                 |
| Remote-only            | Local                   | ✅       | Junction is local; can reference both      |
| Remote-only            | Remote                  | ❌       | Junction is remote; cannot reference local |
| Full sync              | Local                   | ✅       | Junction is local; can reference both      |
| Full sync              | Remote                  | ❌       | Junction is remote; cannot reference local |
| Filtered sync          | Local                   | ✅       | Junction is local; can reference both      |
| Filtered sync          | Remote                  | ❌       | Junction is remote; cannot reference local |
| Query cache            | Local                   | ✅       | Junction is local; can reference both      |
| Query cache            | Remote                  | ❌       | Junction is remote; cannot reference local |

---

### Primary table: remote-only

```ts
{ type: SyncType.None, remote: { adapter: 'supabase' } }
```

Queries remote data; no local storage; cannot establish local relations.

---

### Primary table: full sync

```ts
{
  type: SyncType.Full,
  local: { adapter: 'wa-sqlite' },
  remote: { adapter: 'supabase' }
}
```

#### One-to-many (primary 1 ← related N, foreign key on the related side)

| Related table strategy | Feasible | Why                                             |
| ---------------------- | -------- | ----------------------------------------------- |
| Local-only             | ✅       | Foreign key is local; can reference local       |
| Remote-only            | ❌       | Foreign key is remote; cannot reference local   |
| Full sync              | ✅       | Foreign key is local; can reference synced data |
| Filtered sync          | ✅       | Foreign key is local; can reference synced data |
| Query cache            | ✅       | Foreign key is local; can reference cached data |

#### Many-to-one (related N → primary 1, foreign key on the related side)

The current entity is the related side; the primary table's strategy:

| Related table strategy | Feasible | Why                                             |
| ---------------------- | -------- | ----------------------------------------------- |
| Local-only             | ✅       | Foreign key is local; can reference local       |
| Remote-only            | ✅       | Foreign key is local; can reference remote      |
| Full sync              | ✅       | Foreign key is local; can reference synced data |
| Filtered sync          | ✅       | Foreign key is local; can reference synced data |
| Query cache            | ✅       | Foreign key is local; can reference cached data |

#### One-to-one (foreign key on either side)

| Related table strategy | Foreign key location | Feasible | Why                                             |
| ---------------------- | -------------------- | -------- | ----------------------------------------------- |
| Local-only             | Either               | ✅       | Both local                                      |
| Remote-only            | Local                | ✅       | Foreign key is local; can reference remote      |
| Remote-only            | Remote               | ❌       | Foreign key is remote; cannot reference local   |
| Full sync              | Either               | ✅       | Both synced to local                            |
| Filtered sync          | Local                | ✅       | Foreign key is local; can reference synced data |
| Filtered sync          | Remote               | ❌       | Foreign key is remote; cannot reference local   |
| Query cache            | Local                | ✅       | Foreign key is local; can reference cached data |
| Query cache            | Remote               | ❌       | Foreign key is remote; cannot reference local   |

#### Many-to-many (junction table stores both ids)

| Related table strategy | Junction table location | Feasible | Why                                                |
| ---------------------- | ----------------------- | -------- | -------------------------------------------------- |
| Local-only             | Local                   | ✅       | Both local                                         |
| Remote-only            | Local                   | ✅       | Junction is local; can reference both              |
| Remote-only            | Remote                  | ❌       | Junction is remote; cannot reference local         |
| Full sync              | Local                   | ✅       | Junction is local; can reference both              |
| Full sync              | Remote                  | ✅       | Both synced; can relate remotely                   |
| Filtered sync          | Local                   | ✅       | Junction is local; can reference both              |
| Filtered sync          | Remote                  | ⚠️       | Ensure the related data is synced                  |
| Query cache            | Local                   | ✅       | Junction is local; can reference both              |
| Query cache            | Remote                  | ❌       | Cache is unpredictable; consistency not guaranteed |

---

### Primary table: filtered sync

```ts
{
  type: SyncType.Filter,
  local: { adapter: 'wa-sqlite' },
  remote: {
    adapter: 'supabase',
    filter: () => ({
      combinator: 'and',
      rules: [{ field: 'updatedAt', operator: '>=', value: new Date(Date.now() - 30 * 86400000) }]
    })
  }
}
```

Same as full sync, with two notes:

- If the related table is also filtered sync, make sure the filter preserves data completeness
- With the junction table remote, make sure both related sides satisfy the sync conditions

---

### Primary table: query cache

```ts
{
  type: SyncType.QueryCache,
  local: { adapter: 'wa-sqlite' },
  remote: { adapter: 'supabase' }
}
```

Same as full sync, but with more restrictions:

- A remote junction table is not recommended (cached data is unstable)
- Related tables should be local-only or also query cache (so related data is available)
