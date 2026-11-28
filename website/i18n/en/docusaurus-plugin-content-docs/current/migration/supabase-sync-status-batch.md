# Supabase sync status in one round

US-236 adds two read-only functions so that sync status is computed in one round instead of one repository at a time: `rxdb_entity_sync_infos(p_entities)` answers the registration of several entities at once, and `rxdb_pending_change_counts(p_probes, p_branch_ids)` counts the pending changes of several repositories at once.

Before, opening a page that shows sync status, or resubscribing to Realtime, sent three requests per repository: check the remote identity, ask for the registration, count the log. The shared channel and each bucket channel each reported "subscribed", so the whole round ran twice. Opening the dev-rxdb-supabase catalog page took 113 requests; after the upgrade it takes 11. One pull with nothing pending went from 26 requests to 8 plus one per readable bucket.

## Changes

| Object                                                                 | Change                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb_entity_sync_infos(p_entities jsonb)` (02)                        | New. `p_entities` is `[{"namespace", "entity"}]`; returns, in request order, what `rxdb_entity_sync_info` returns for each item. `SECURITY INVOKER`: the registry is still only read through `rxdb_entity_sync_info`                                                                  |
| `rxdb_pending_change_counts(p_probes jsonb, p_branch_ids text[])` (02) | New. Each probe counts the log rows of one entity (one bucket of a bucketed entity) after the cursor, on the given branches, not listed in `excludeIds`. `SECURITY INVOKER`: counts under the RLS of `rxdb_change`, so anon only counts readable buckets and never the unbucketed log |
| Production permission script                                           | Both functions are revoked from `PUBLIC` and granted to `anon`, `authenticated` and `service_role`                                                                                                                                                                                    |
| `@aiao/rxdb-plugin-sync`                                               | Status queries check the remote identity once per round and call each function once; `pull()` asks for registrations once per round; system tables no longer take part in batch pulls and are never counted remotely (status still lists them, with 0 pending)                        |
| `@aiao/rxdb-adapter-supabase`                                          | Implements both batch methods; the Realtime channels created together request one pullable recount after all of them report an outcome, and a channel that later rejoins requests its own                                                                                             |

`excludeIds` are the remote ids this client pushed (the `RxDBChange.remoteId` written by push receipts). They travel in the request body, so URL length is not a concern. Bucket counts match the one-by-one count (`getBucketChangeCount`): a bucket revoked mid-way counts 0.

## Upgrade

### 1. Update the server SQL

Both functions live in 02. The upgrade command of the [sync access migration](/migration/supabase-sync-access.md) (incremental script → 02 → 04 → permission script, one transaction) installs them. To add just these two, run 02 and the permission script in one transaction:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f docker/sql/02-rxdb-sync-functions.sql \
  -f path/to/your-caller-buckets.sql \
  -f docker/sql/production/rxdb-change-grants.sql
```

Each run of 02 resets `rxdb_caller_buckets()` to the platform default; deployments that override it put the override before the permission script. In the Supabase SQL Editor, put `BEGIN;`, the full contents of the files and `COMMIT;` in **one execution**.

Old clients do not call these functions, so upgrading the SQL first does not affect them.

### 2. Upgrade the client

Only after step 1. New clients call both functions from status queries and pulls; against old SQL they fail with `Could not find the function public.rxdb_entity_sync_infos` (or `rxdb_pending_change_counts`), code `PGRST202`, and stop where they are with local data untouched.

There is no fallback: PostgREST also answers `PGRST202` while its schema cache is stale, when the server already has bucketed entities, and falling back to one-by-one queries would hide that. If it still fails after deploying, run `NOTIFY pgrst, 'reload schema';` once.

Custom remote adapters need no change: `ScopedSyncAdapter.getEntitySyncInfos` and `PendingChangeCountAdapter.countPendingChanges` are optional. Without them the sync plugin asks one repository at a time, at most 4 at once, and gets the same numbers.

## Verify

As a signed-in user; answers follow the order of the input:

```sql
SELECT public.rxdb_entity_sync_infos('[{"namespace":"public","entity":"Todo"}]');
-- [{"entity": "Todo", "bucketed": false, "namespace": "public", "tableName": "todos"}]

SELECT public.rxdb_pending_change_counts(
  '[{"namespace":"public","entity":"Todo","bucket":null,"afterId":0,"excludeIds":[]}]',
  ARRAY['main']
);
-- [<unbucketed Todo log rows on main>]
```

On the client, open a page that shows sync status: in the network panel the status query is just one each of `rxdb_backend_id`, `rxdb_entity_sync_infos`, `rxdb_caller_buckets` (with bucketed entities) and `rxdb_pending_change_counts`, however many repositories there are.
