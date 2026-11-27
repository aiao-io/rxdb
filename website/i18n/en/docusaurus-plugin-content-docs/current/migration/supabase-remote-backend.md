# Supabase remote identity and remote resets

When `@aiao/rxdb-adapter-supabase` pulls remote changes, it uses the auto-increment `id` of `rxdb_change` as the cursor. That `id` is only monotonic within one database: after the database is torn down and rebuilt, or after the change log is wiped with `TRUNCATE ... RESTART IDENTITY`, `id` counting restarts from the beginning, and an existing client's cursor skips past all of the new database's `id`s:

- Pulls silently return 0 rows, with no error in `SyncState`;
- Pushes proceed as usual, and local changes are written into a database that lacks their history.

## The fix

The remote gains an identity value that the client stores together with its cursor:

- The reference SQL adds a single-row table `public.rxdb_backend` and a reader function `rxdb_backend_id()`. When the database is rebuilt, this table is rebuilt with it and generates a new value; when `rxdb_change` is `TRUNCATE`d, the trigger `rxdb_change_rotate_backend_id` also rotates in a new value.
- The local `RxDBSync` gains a nullable column `remoteBackendId` (system schema 9, added automatically at connect). On the first data exchange with a remote, existing sync records bind to the remote's current identity; records created afterwards carry it from creation.
- `@aiao/rxdb-plugin-sync` compares before every data exchange with the remote. As soon as any record is bound to a different identity, sync stops and local data is untouched: pull, push, pending-count, and other entry points throw `RemoteBackendMismatchError`; the error is also written into `lastError` of `rxdb.syncState`, readable through `useSyncState()` in all three frameworks.
- A rebuild mid-sync also stops it: each pulled round, and each push receipt, is compared again before being written to the database, so neither the cursor nor the push watermark advances. Rounds already written before that point count as progress; what is thrown is `RxDBPartialSyncError` with `RemoteBackendMismatchError` as its `cause`. Branch materialization freezes the remote identity together with the cutoff id, so a first materialization (no local sync records yet) also recognizes a rebuild after the freeze.

The plugin never rebinds automatically. When the remote address is changed to a different project, the same error is reported; auto-rebinding then would pull someone else's data into the local database, and push local pending changes over there.

## Recovery

After confirming the new remote really is the one to sync with, rebind explicitly and pull from scratch:

```ts
import { RxDBPartialSyncError } from '@aiao/rxdb';
import { RemoteBackendMismatchError } from '@aiao/rxdb-plugin-sync';

try {
  await rxdb.syncManager.sync();
} catch (error) {
  // On a mid-sync rebuild, rounds already written count as progress; the remote identity error hangs on RxDBPartialSyncError's cause
  const cause = error instanceof RxDBPartialSyncError ? error.cause : error;
  if (!(cause instanceof RemoteBackendMismatchError)) throw error;
  // cause.boundBackendIds: the old identity the local cursor belongs to; cause.backendId: the remote's current identity
  if (await confirmRemoteReset(cause)) {
    await rxdb.syncManager.rebindRemoteBackend();
    await rxdb.syncManager.pull({ fetchAll: true });
  }
}
```

`rebindRemoteBackend()` clears every pull cursor that does not belong to the new remote and rebinds to the new identity, in one transaction:

- The next pull fetches everything from the beginning;
- The push watermark does not move: local changes not yet pushed go out as usual; changes already pushed to the old remote are not re-pushed. Putting that data back onto the new remote is recovery, not sync — use backup and restore;
- After a successful rebind, the remote identity error in `lastError` is cleared with it.

## Upgrading

Update the server-side SQL first, then upgrade the client. A new client against old SQL reports `Could not find the function public.rxdb_backend_id` from the sync entry points.

Run the following three steps in order; each is safe to repeat:

1. Create the identity table. This fragment comes from `docker/sql/01-rxdb-system-tables.sql`; there is no need to rerun the whole 01:

   ```sql
   CREATE TABLE IF NOT EXISTS public.rxdb_backend (
     singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
     id uuid NOT NULL DEFAULT gen_random_uuid(),
     "createdAt" timestamptz(3) NOT NULL DEFAULT now()
   );

   INSERT INTO public.rxdb_backend DEFAULT VALUES
   ON CONFLICT (singleton) DO NOTHING;
   ```

2. Rerun the new `docker/sql/02-rxdb-sync-functions.sql`, which installs `rxdb_backend_id()` and the rotation trigger. The functions in 02 reference this table, so complete step 1 first:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/02-rxdb-sync-functions.sql
   ```

3. Rerun `docker/sql/production/rxdb-change-grants.sql` to revoke `anon` / `authenticated` write access to `rxdb_backend`. If a client could modify this row, it could make every client believe the remote was reset and stop syncing:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/production/rxdb-change-grants.sql
   ```

Afterwards, confirm with the following query — one uuid is enough:

```sql
SELECT public.rxdb_backend_id();
```

### Local database

System schema goes from 8 to 9; the column is added automatically at connect, and old rows have an empty `remoteBackendId`. After the upgrade, older clients refuse to open this database; multiple tabs and windows on the same database must upgrade together.

### Custom remote adapters

`RxDBAdapterRemoteBase` gains the abstract method `backendId(): Promise<string>`. The returned value must change after the remote is rebuilt or the change log is wiped and re-counted; do not substitute things that stay the same across a rebuild, like the connection address or the project name. Adapters that do not support change-log sync throw an unsupported error directly instead of returning a placeholder; `RxDBAdapterHttp` throws `HttpChangelogUnsupportedError`.

## Resetting the remote on purpose

- Tear down and rebuild, or `TRUNCATE public.rxdb_change`: the identity rotates automatically, existing clients stop, and the app waits for a rebind;
- Only `DELETE` the log without resetting the sequence: `id` keeps incrementing, cursors remain valid, and the identity does not change;
- Manual `ALTER SEQUENCE ... RESTART`: not recognizable. If you really must do this, rotate the identity at the same time:

  ```sql
  UPDATE public.rxdb_backend SET id = gen_random_uuid(), "createdAt" = now() WHERE singleton;
  ```

## Resets that happened before the upgrade

On the first sync after the client upgrade, existing sync records bind to the remote's current identity. If the remote was already rebuilt before the upgrade, that rebuild is not recognizable, and the cursor skips past the new database's `id`s as before; calling `rebindRemoteBackend()` afterwards also does not clear cursors, because the records already belong to the current identity. When you suspect a client's cursor is still on the old database, first confirm its local changes are all pushed, then delete its local database and re-sync from scratch.
