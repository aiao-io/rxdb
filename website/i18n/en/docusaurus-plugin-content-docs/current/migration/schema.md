# Schema migrations

When an entity's structure changes (new fields, renames, data backfills), run a one-time data change before the database connects using RxDB's **migration script** mechanism.

## Migration mechanism

Migration scripts are declared in the `migrations` array of the `RxDB` configuration; each migration implements `MigrationType`:

```typescript
import type { MigrationType, TransactionExecutor } from '@aiao/rxdb';

interface MigrationType {
  name: string; // unique name; migrations run sorted by name
  up(executor: TransactionExecutor): Promise<void>; // forward migration
  down(): Promise<void>; // rollback (reserved)
}
```

Execution rules:

1. Migrations run automatically during the database connection phase (after table creation).
2. They run sorted lexicographically by `name` — use `0001-`, `0002-` prefixes to guarantee the order.
3. Executed migrations are recorded in the built-in `rxdb_migration` table and **never run twice**.
4. When a migration's `up()` throws, the error is recorded and the migration is aborted; fix the problem and reconnect to continue.

> **Why `up()` receives `executor`**: `up()` is the only user code that can run inside the migration transaction body. All data writes in a migration must go through `executor.getRepository(X)` or `executor.query()` — calling `entity.save()` directly falls back onto the adapter queue and hangs forever (the queue's only slot is occupied by the transaction this migration runs in). The parameter may be omitted (TS allows fewer parameters); migrations that write no data need not care about it.

## Built-in system migrations

The SQLite-family adapters and PGlite automatically upgrade the system tables RxDB maintains itself, before application migrations, business repositories, and the new change triggers are enabled. Applications do not need to write migration scripts for `rxdb_change`.

- System migrations first take an exclusive upgrade lock on the backend to exclude old write transactions in flight; if the lock cannot be acquired, `connect()` aborts.
- DDL, legacy data compatibility handling, trigger rebuilding, and the system version watermark commit in the same transaction. Any step failing rolls the whole thing back; fix the problem and reconnect to retry.
- `__rxdb_system_schema__:` and `__rxdb_change_codec__:` are reserved migration name prefixes; application migrations must not use them.
- When the current client finds the database's system schema or change codec above the version it supports, it refuses to connect outright — it does not guess formats or continue reading and writing.

## Migration exclusivity and failure recovery

System migrations run inside **one backend-exclusive transaction** (`BEGIN EXCLUSIVE` on SQLite; table locks + `tx` on PGlite):

- If the lock cannot be acquired, `RxDBSystemMigrationLockError` is thrown and `connect()` aborts; business triggers do not start — this excludes **write transactions currently executing on the same backend**.
- DDL, legacy data compatibility handling, trigger rebuilding, and the system version watermark commit in the same transaction; any step failing rolls the whole thing back, and after a crash the database remains at its pre-transaction state — no half-migrated schema is left behind.
- Migrations therefore have **no intermediate state needing manual cleanup**: fix the problem and reconnect to retry; no manual edits to any system table.

> RxDB does **not** provide a cross-tab / worker / process writer lease or epoch fencing. Exclusivity only extends to SQLite / PGlite's own locks: it can block transactions that are writing at the same time, but it cannot block an old client that "connected earlier, hung for a long time, and recovers later". That kind of cross-realm exclusion must be handled by the release system (see the next section).

## Release order

Releases must go through three gates:

1. **Bridge release**: first publish a release that does not change the system schema / change codec, and get every running instance onto it — it is the anchor for migration releases, ensuring that "when the migration happens, every online client is already new code".
2. **Migration release**: only after the bridge release covers all running instances may you publish a release that bumps the system schema or change codec; before publishing, run the SQLite multi-process and PGlite worker/tab migration suites.
3. **Old bundle gate**: prevent offline bundles below the minimum bridge version from writing again, using forced updates, cache invalidation, a server-side version gate, or a new database namespace. Old bundles must not be allowed to connect to a migrated database.

Repository releases declare the release kind (`normal` / `bridge` / `migration`), the bridge tag, the minimum bridge version, and the old-bundle strategy in `requirements/migration-release.json`, validated by `pnpm nx run @aiao/source:migration-release-gate`. A migration release missing any item fails closed; the bridge tag must also really exist, be an ancestor of the release commit, and contain the system migration implementation.

A deployment rollback must not point an old bundle at an upgraded database; restore the pre-upgrade backup, or switch to a new database namespace. The runtime has **no** mechanism to recognize and reject an offline old bundle — the third gate is the only line of defense.

System migrations are one-way upgrades. An upgraded database is not promised to be reopenable by older clients; before publishing a new client, stop older versions from writing and make sure all running instances upgrade together. When an application version must be rolled back, restore the pre-upgrade database backup; do not let old clients connect to an upgraded database directly.

## Declaring migrations

```typescript
import { RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

const db = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  migrations: [
    {
      name: '0001-backfill-todo-completed',
      async up(executor) {
        // Holding the executor is what puts you "inside the migration transaction"
        const todoRepo = executor.getRepository(Todo);

        // 1. Read the historical data
        const todos = await todoRepo.find({});

        // 2. Backfill: fill missing completed fields with false
        for (const todo of todos) {
          if (todo.completed === undefined) {
            todo.completed = false;
            await todoRepo.update(todo);
          }
        }
      },
      async down() {
        // Reserved: implement rollback here if needed
      }
    }
  ]
});

await db.connect('sqlite');
```

## Naming and ordering advice

- Use zero-padded numeric prefixes (`0001-`, `0002-`) so lexicographic order equals execution order.
- Never rename a published `name` — a rename counts as a new migration and runs again.
- Keep each migration idempotency-friendly: safe to rerun even if partially executed.

## Notes

1. Migrations run **after table creation and before application queries**, when entity repositories can be safely read and written.
2. Migration records persist in the local database; uninstalling or wiping the database resets migration history.
3. For complex structural changes (field renames, table splits), the recommended approach is: add fields → backfill → retire old fields gradually, across multiple migrations.

## See also

- [Switching adapters and migrating data](./adapters.md)
- [v0 → 1.0 upgrade](./v1.md)
