# SyncBranchesResult

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L19)

The result of one round of [SyncManager.syncBranches](SyncManager.md#syncbranches).

## Remarks

`created + updated + skipped.length` does not necessarily equal `total`:
branches that exist locally and were already marked `remote` long ago count
neither as `updated` nor enter `skipped`.

## Properties

### created \{#created\}

```ts
created: number;
```

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L21)

The number of remote branches newly created locally this round.

***

### skipped \{#skipped\}

```ts
skipped: string[];
```

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L43)

The remote branch ids **not created** this round — see the entry under the same id in [skipReasons](#skipreasons) for the specific reason.

A branch may be skipped because of its own problem (an unusable id, or the
fork-point change not yet pulled locally so it cannot be translated into a
local id), or simply because its parent was skipped this round — in the latter
case this branch itself is fully qualified, but the parent does not land this
round, and if it were still created as usual, its `parentId` would be a
dangling foreign key pointing at a "parent that does not exist this round"
(`rxdb_branch.parentId` is a foreign key whose check is deferred by
`PRAGMA defer_foreign_keys` until COMMIT, which would then roll back the whole
transaction, taking every branch that should have succeeded this round with
it). The three causes share one `skipped` channel because handling is the same
for the caller: this id has no local branch this round, and that is all.

**Skipping leaves no persistent mark**: every round fully re-pulls remote
branches and re-judges from scratch, and `skipped` and [skipReasons](#skipreasons)
only report this round. `unresolved-from-change-id` heals itself once the
fork-point change is pulled locally, and the `ancestor-skipped` hanging under
it heals along; `invalid-id`, on the other hand, re-pulls and re-skips every
round until the remote changes, occupying a slot forever — callers tell the two
kinds apart via [skipReasons](#skipreasons). Whether to keep a persistent
"known bad row" mark is registered in `requirements/roadmap.md` under
"architecture items deferred by the epic-006 review".

***

### skipReasons \{#skipreasons\}

```ts
skipReasons: Record<string, SyncBranchSkipReason>;
```

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L52)

The specific skip reason for each id in `skipped`; the keys cover every item of `skipped`, one to one.

A separate field instead of stuffing the reason into the `skipped` array
itself: the shape `skipped: string[]` is already consumed by external parties
as an "id list", and changing it to an object array is a breaking change;
`Record<id, reason>` is purely additive, and existing callers reading only
`skipped` are unaffected.

***

### total \{#total\}

```ts
total: number;
```

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L25)

The total number of branches the remote handed back this round, including the skipped ones.

***

### updated \{#updated\}

```ts
updated: number;
```

Defined in: [packages/rxdb-plugin-sync/src/sync-branches.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/sync-branches.ts#L23)

The number of branches that exist locally and got their `remote: true` mark filled in this round.
