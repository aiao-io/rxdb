# Supabase change log commit order fix

When `@aiao/rxdb-adapter-supabase` pulls remote changes, it uses the auto-increment `id` of `rxdb_change` as the cursor and only fetches changes whose `id` is greater than the last position. Auto-increment `id` values are assigned at write time but only become visible to other sessions at commit. When several log-writing transactions run concurrently, the transaction that got its `id` first may commit later:

1. Transaction A writes a log entry and gets `id = 100`, not yet committed;
2. Transaction B writes a log entry, gets `id = 101`, commits immediately;
3. Client C pulls, sees only 101, and its cursor advances to 101;
4. A commits. C pulls from 101 onward every time from now on, so `id = 100` is never fetched again — with no error at all.

A and B can be pushes from two clients, or a push plus a direct write to a business table (the sync trigger writing the log).

## The fix

The reference SQL attaches a statement-level trigger `rxdb_change_serialize_append` to `rxdb_change`. Log-writing transactions first take the same transaction-level advisory lock and hold it until commit. Log-writing transactions therefore commit one at a time, and a change that commits later always gets a larger `id`. Pushes, sync triggers, and any path that writes `rxdb_change` directly all pass through this trigger.

The adapter also lists SQLSTATE `40P01` (deadlock) as a retryable write failure: a push aborted by the database is resent automatically.

## Upgrading

Server-side SQL only; the client needs no upgrade, and `01-rxdb-system-tables.sql` does not need rerunning:

- When the deployed `02-rxdb-sync-functions.sql` and `04-rxdb-utils-functions.sql` already match the repository (after completing [Supabase update push migration](./supabase-update-push.md)), rerun the new `02`:

  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docker/sql/02-rxdb-sync-functions.sql
  ```

- When you are still on an earlier version, upgrade 02 and 04 together in one transaction as [Supabase update push migration](./supabase-update-push.md) describes; the trigger comes with the new 02. Do not rerun only 02.

After installing, confirm with the following query — one row is enough:

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.rxdb_change'::regclass AND tgname = 'rxdb_change_serialize_append';
```

## The cost

From writing the first log entry until commit, log-writing transactions queue:

- A push writes its log only after the business write completes, so only the tail segment queues; under normal traffic it is imperceptible;
- Long transactions that write business tables directly (for example, bulk-updating hundreds of thousands of rows in SQL) block pushes the whole time. When the wait exceeds the calling role's `statement_timeout` (Supabase default: `anon` 3 seconds, `authenticated` 8 seconds), the push fails and the next sync round resends it. Split bulk maintenance into small transactions where possible, or run it in a maintenance window;
- A multi-statement direct-write transaction and a push that touch the same row can deadlock with each other; PostgreSQL detects it and aborts one of them (`40P01`). When the aborted one is the push, the adapter retries automatically; when it is your own transaction, retry the usual PostgreSQL way.

## Changes already missed before the upgrade

The trigger only guarantees no further misses; already-missed changes are not backfilled automatically: the client's cursor has already passed them. When you suspect a client has missed changes, first confirm its local changes are all pushed, then delete its local database and re-sync from scratch.
