# Supabase UPDATE and cascade delete migration

The batch modifications `@aiao/rxdb-adapter-supabase` executes through `mutations()` used ordinary `UPDATE`, delivered through `rxdb_mutations.p_updates`. US-220 previously fixed the push path for local changes; this US-223 wires the same semantics into the batch direct-write transaction and makes `mutations()` return the rows the server actually wrote. US-224 also fills in the change logs for child rows actually cascade-deleted by a foreign key after a parent row deletion is pushed.

**Update the two reference SQL scripts in one database transaction first, then upgrade the client.** For databases that already have the system tables and the idempotency indexes installed, update `docker/sql/02-rxdb-sync-functions.sql` and `docker/sql/04-rxdb-utils-functions.sql` in the order 02 → 04 this time and commit them together; `01-rxdb-system-tables.sql` is unchanged.

## UPDATE changes

Upserts (`INSERT … ON CONFLICT DO UPDATE`) are first evaluated as INSERT. A partial-column payload may miss required columns, and the INSERT's `WITH CHECK` may also be narrower than the UPDATE policy: under an owner-type policy a missing author column, or modifying a row someone else created during shared editing, both get wrongly rejected. An ordinary UPDATE is only constrained by the UPDATE and SELECT policies.

| Path                                      | UPDATE payload                                                                                                                                                        | Returned result                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Local change push (US-220)                | `id`, the changed columns, and `updatedBy`; columns not present keep their remote values                                                                              | Push result and per-entity receipts                                                                                              |
| `mutations()` batch direct write (US-223) | The serialized full entity, `id` used for locating, `createdBy` removed, the current user's `updatedBy` injected, all other present columns participate in the update | The actual rows of `UPDATE … RETURNING`, returned by `mutations()` together with the new rows, for callers to read server fields |

Direct writes have no per-column dirty tracking, and no diff derivation from the entity cache. New rows still go through `p_upserts` executing INSERT / upsert; the author-injection semantics on creation are unchanged.

The ordinary single-entity `save()` goes through `EntityManager.update` → `SupabaseRepository.update`, which already executed an ordinary UPDATE through PostgREST; only batch graph changes go through `mutations()`. The existing `EntityManager.save` discards the batch RPC return value and returns the original entity; this change does not modify that behavior. Callers that need the server's final row should read `mutations()`'s return value, and must not assume from this that `save()` automatically merges server fields.

The SQL adds `rxdb_batch_update_rows` (`SECURITY INVOKER`); only direct writes return UPDATE rows through it. The direct-write transaction (`p_skip_sync = false`) `upserted` array contains both the created and the modified server rows; pushes do not return modified rows and still use the original `rxdb_batch_update` integer-count entry. `updated` means the modified count on both paths.

Returning full rows from direct writes requires SELECT permission on the corresponding columns, and the modified rows must also satisfy the SELECT policy. The count entry and the push keep UPDATE without RETURNING, and do not gain a full-column SELECT or a post-modification row-visibility requirement just because direct writes return rows; existing permissions and RLS semantics remain compatible.

When an UPDATE updates zero rows, no crippled row is inserted to revive it:

| SQLSTATE | `details.reason` | Meaning                                                                          |
| -------- | ---------------- | -------------------------------------------------------------------------------- |
| `42501`  | `denied`         | The row still exists, but the caller's row-level permissions forbid modifying it |
| `RX001`  | `gone`           | The row no longer exists                                                         |

Direct-write `mutations()` wraps the error as `SupabaseDataError`, and all the batch's inserts, updates, and deletes roll back together. With receipts enabled, pushes handle rejections per entity; without, the whole batch rolls back; see [Push receipts migration](./supabase-push-receipts.md). `details` is JSON text containing `op` / `schema` / `table` / `entityId` / `reason`.

## Cascade delete changes

Previously `p_skip_sync = true` skipped all sync trigger logging; when the client only sent a parent deletion, the child rows cascade-deleted by the foreign key had no log, and other clients were left with ghost child rows after pulling. This change keeps client logs for explicit changes; the trigger first captures the actual DELETE, and the RPC then appends the implicit log after the source log, writing them together.

- Each child row not explicitly sent gets one DELETE log, the full `OLD` in `beforeData`, with `afterData = null` and `snapshotComplete = true`.
- Implicit logs have NULL `clientId` / `localId`, so the client that pushed the parent deletion can also pull back the child row deletions.
- Child rows explicitly deleted in the same batch keep the client log and id mapping, with no duplicated implicit log; explicit deletions pair with actual deletions by the equality relation of the id column type (the same criterion as DELETE, so uuid case and `numeric` `1` versus `1.00` count as the same row), and merge per partition root table. When a child row is first rejected by policy and then cascaded by an allowed parent deletion, the final receipt records `applied` according to the actual result; the last explicit DELETE's snapshot always takes the actually-deleted `OLD` — the client DELETE's `inversePatch` does not contain `id` and cannot substitute.
- When the same batch creates or modifies child rows and then deletes the parent row, the source INSERT / UPDATE precedes the implicit DELETE, so other sides do not revive the child rows after pulling. The RPC preserves the log array order and writes it once; all logs commit or roll back together with the business writes.
- Retrying a successful batch reuses the existing idempotency keys and skips entity side effects, and does not generate implicit delete logs again. The trigger mode (`p_skip_sync = false`) behavior is unchanged.

Foreign key actions can delete child rows the caller cannot see under the business tables' RLS. The full `OLD` log follows the existing trigger-mode read boundary and may contain all of the child row's columns; business-table RLS does not automatically provide per-row authorization isolation for change logs. The log's authorization and read scope must be designed separately, following the application's data boundaries.

## Upgrade order

1. Confirm the database has the original system tables, the `clientId + localId` idempotency index, and the push-receipt prerequisites of the version in use; migrations from even earlier versions cannot be skipped just because 01 does not need rerunning this time.
2. Execute the two function scripts in one database transaction:

   ```bash
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
     -f docker/sql/02-rxdb-sync-functions.sql \
     -f docker/sql/04-rxdb-utils-functions.sql
   ```

   02 updates the actual DELETE capture, and 04 updates the direct-write UPDATE return rows and the unified delete-log writing; they must be the same version and commit atomically. Two separate `psql` commands leave an intermediate window of new triggers with the old RPC, and pushes inside that window can miss cascade logs. When either script fails, the command above rolls back all function changes.

   With the Supabase SQL Editor, put `BEGIN;`, the full contents of 02, the full contents of 04, and `COMMIT;` in **one execution**, not two separate commits of the two files. If the deployment tooling cannot run two scripts in one transaction, forbid business writes during a maintenance window, and restore writes after both scripts complete. The generic sync triggers already mounted on existing business tables use the new functions.

3. Upgrade the `@aiao/rxdb-adapter-supabase` client dependency.
4. With the application's RLS role, verify `mutations()`'s return values against the database's final rows, and verify the parent-child cascade delete and the pull loop.

This change adds no system tables or columns and does not require rerunning `01-rxdb-system-tables.sql`. If you rerun an old base script that contains broad GRANTs at the same time, still finish with `docker/sql/production/rxdb-change-grants.sql` to tighten log write permissions; see [Production deployment](../adapters/supabase.md#production-deployment).

## Old/new version combinations

| Client / SQL combination                 | Result                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old client + new 02 / 04                 | Function entries stay compatible; the server-side implicit cascade log is fixed. Old clients' direct writes still build upserts the old way; the client must upgrade to fix that path                         |
| New client + SQL from before this change | This deployment order is unsupported; even with `p_updates` present, the old SQL still lacks the modified-row return or the implicit cascade log, so a successful RPC call does not prove the upgrade is done |
| New client + new 02 / 04                 | The UPDATE return rows and cascade log semantics described on this page                                                                                                                                       |

SQL even older, without `p_updates` support, may report `PGRST202` / `Could not find the function public.rxdb_mutations`. The current client's error code is readable from `SupabaseDataError.code`. Upgrade the corresponding SQL and retry; failed local pushes keep their pending changes.

## See also

- [Supabase adapter](../adapters/supabase.md)
- [Supabase push receipts migration](./supabase-push-receipts.md)
- [Supabase transport failure error type migration](./supabase-network-errors.md)
