# Supabase push receipts migration

The push path of `rxdb_mutations` changed from "the whole batch succeeds or the whole batch fails" to **per-entity receipts**: when one change in a pushed batch is rejected by row-level permissions (or its target row no longer exists, or a parent entity it depends on was rejected), it no longer drags down the other changes in the same batch that could succeed. This is a **breaking change**: the remote merge result contract `RemoteMergeResult` changed shape, and custom remote adapter authors must follow; developers who only use `@aiao/rxdb-adapter-supabase` need no business code changes, but must upgrade the reference SQL before upgrading the client dependency, and understand the new semantics for rejected changes.

## Blast radius

| Who you are                                                                  | What to do                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Author of a custom adapter implementing `RxDBAdapterRemoteBase.mergeChanges` | Must change: the return shape changed (see the next section), otherwise it does not compile                         |
| Only using `@aiao/rxdb-adapter-supabase`                                     | No business code changes; run the new reference SQL before upgrading; understand the new `lastRejections` semantics |

## The `mergeChanges` return value changed (custom remote adapter authors)

`RemoteMergeResult`'s `changeIdMapping` (optional) is replaced by `results` (required), and `mergeChanges`'s return type tightens from a union to a single type:

**Before**

```ts
export interface RemoteMergeResult {
  maxChangeId?: number;
  changeIdMapping?: Array<{ localId: number; remoteId: number }>;
}

abstract mergeChanges(
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
): Promise<RemoteMergeResult | number | void>;
```

**After**

```ts
export interface RemoteMergeResult {
  /** Largest remote change id from this round */
  maxChangeId?: number;
  /** The result of each source change; must cover exactly all the `changes` passed to the call */
  results: RemoteChangeResult[];
}

export type RemoteChangeResult =
  | { localId: number; status: 'applied'; remoteId: number }
  | { localId: number; status: 'rejected'; rejection: RemoteChangeRejection };

export interface RemoteChangeRejection {
  /** Database SQLSTATE, e.g. `42501` */
  code: string;
  /** Classification: permission denied / target row no longer exists / a dependent entity is unavailable */
  reason: 'denied' | 'gone' | 'dependency';
  /** Original message from the remote */
  message: string;
  /** The rejected entity */
  entity: RemoteEntityRef;
  /** Points at the parent entity when `reason = 'dependency'`; the constraint name when it cannot be located */
  dependsOn?: RemoteEntityRef | { constraint: string };
}

abstract mergeChanges(
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
): Promise<RemoteMergeResult>;
```

`RemoteEntityRef` (`{ namespace, entity, entityId }`) keeps its shape.

Migration essentials:

- `changeIdMapping` is deleted; use `results`, and it goes from "may be omitted" to **required** — previously, when the remote returned nothing, the caller fell back to "no mapping" and let it pass; now an empty value is itself a contract violation.
- `results` must cover exactly the `changes` argument passed to the call: **each source change (`IRxDBChange`) appears exactly once**, either `status: 'applied'` with `remoteId`, or `status: 'rejected'` with `rejection`. Return an empty array when no `changes` were passed.
- The return type tightens from `RemoteMergeResult | number | void` to a single `Promise<RemoteMergeResult>` — old code that "returns a number as `maxChangeId`" or "returns nothing" no longer type-checks.

### The push repository now validates `results`

The push repository of `@aiao/rxdb-plugin-sync` no longer trusts a remote that "says nothing": it checks `results` for coverage, and all three of the following fail the whole push round and hold the watermark:

- **Missing**: some source change's `localId` in `changes` does not appear in `results`;
- **Duplicate**: the same `localId` appears more than once;
- **Unknown**: `results` contains a `localId` that was not passed to the call.

Custom adapters that relied on implicit fallbacks like "return a partial mapping and treat the rest as remote id equals local id" now throw at push time instead of silently producing wrong `remoteId`s.

## `PushRepositoryResult` gains a required `rejected` field

The push repository result gains a required field `rejected: number` (the number of source changes rejected this round). Read it together with the existing `pushed`: `pushed` now only counts `status: 'applied'` changes and no longer includes rejected ones. Like `failures`, it is designed as required rather than optional — "the field is missing" and "nothing was rejected" are two different things, and an optional field would force callers to write `result.rejected ?? 0` and guess the meaning of the absence.

## Local semantics of rejected changes

After a source change is rejected by the remote, the local handling **persistently marks it terminal and never re-pushes it**, instead of the old whole-batch failure that left it in the pending queue retrying forever:

- The local `RxDBChange` gains two columns: `rejectedAt` (the rejection moment) and `rejection` (the rejection reason, same shape as `RemoteChangeRejection`). The two are mutually exclusive with `remoteId` — at most one of the three is non-null per change.
- The "pending push" predicate changes from "`remoteId = null`" to "`remoteId = null AND rejectedAt = null`": rejected changes are no longer picked up by the next push round, and no longer wedge queries like pending counts or expiry cleanup forever.
- When a push commits, the rejected **entities** (not single changes — all source changes of that entity rejected in this batch, together) are aligned to the remote's current value: if the remote still has the row, the whole row is overwritten with the remote value; if the remote no longer has it, the local row is deleted. The alignment creates no new local changes and does not enter the undo stack.
- Rejection is not permanent: the next local modification goes through the normal push flow and gets judged again; after remote permissions or data change, it can perfectly well become `applied`.

The framework side reads the latest round's rejection list through `SyncState.lastRejections` (exposed symmetrically by `useSyncState()` in all three frameworks); the full fields, semantics, and a cross-restart query example are in [Rejected pushes](../plugins/rxdb-plugin-sync/README.md#rejected-pushes) in the `@aiao/rxdb-plugin-sync` docs, not repeated here.

## System schema 6 → 7

`RXDB_SYSTEM_SCHEMA_VERSION` goes from 6 to 7, corresponding exactly to the two new columns from the previous section: `RxDBChange` gains `rejectedAt` (nullable timestamp) and `rejection` (nullable JSON). Both local adapters' `migrateSystemSchema()` add the columns with the idempotent "`ADD COLUMN` only when the column does not exist" form; old rows are not backfilled (both stay `null`). This step runs automatically at `connect()` — no manual migration script; the only caveat is **do not skip minor versions when upgrading consecutively** — if you jump from a much earlier system schema version, `migrateSystemSchema()` still applies each intermediate structural change in order.

## Upgrade order: SQL first, then the client

This change touches both the reference SQL and the client; **you must run the new SQL before upgrading the client dependency**:

1. Run the new `docker/sql/04-rxdb-utils-functions.sql` on the Supabase database. `rxdb_mutations` goes from a 5-parameter signature to a 6-parameter signature; the new sixth parameter `p_receipts boolean DEFAULT false` has a default, so old clients match the first 5 parameters by name and behave unchanged.
2. Upgrade the client dependency `@aiao/rxdb-adapter-supabase` (along with `@aiao/rxdb`, `@aiao/rxdb-plugin-sync`, and the matching framework binding package if you want to read `lastRejections`).

Doing it the other way around (client first) errors at push time, see the next section.

## Old/new version combinations

| Client                     | Remote SQL                      | Result                                                                                                                                                                      |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old (US-220 and earlier)   | Old (5 params, no `p_receipts`) | Pre-change whole-batch semantics, unaffected                                                                                                                                |
| Old (US-220 and earlier)   | New (6 params)                  | `p_receipts` not passed, takes the default `false`: still whole-batch semantics — all or nothing, rejections thrown for the whole batch as `42501` / `RX001` / `RX002`      |
| New (after this migration) | Old (5 params)                  | PostgREST cannot find a function signature with `p_receipts` → `PGRST202` → `SupabaseDataError`; the push fails, the watermark does not advance, local changes stay pending |
| New (after this migration) | New (6 params)                  | The per-entity receipt semantics this page describes                                                                                                                        |

No combination ever "partially succeeds without telling the client" — old SQL with a new client does not silently drop rejection information; it fails the whole push with a recognizable error.

## Error signature of a new client against old SQL

The push throws `SupabaseDataError` with `code` `PGRST202` and a message like:

```
Failed to merge changes: Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_receipts, p_skip_sync, p_updates, p_upserts) in the schema cache
```

The corresponding HTTP response is 404. The push watermark does not advance and local changes are not lost; after running the new SQL, no client action is needed — the next push sends the backlogged changes along.

## See also

- [Supabase adapter](../adapters/supabase.md)
- [`@aiao/rxdb-plugin-sync` · Rejected pushes](../plugins/rxdb-plugin-sync/README.md#rejected-pushes)
- [Supabase update push migration](./supabase-update-push.md): the previous `rxdb_mutations` signature change followed the same "SQL first, then client" upgrade order
