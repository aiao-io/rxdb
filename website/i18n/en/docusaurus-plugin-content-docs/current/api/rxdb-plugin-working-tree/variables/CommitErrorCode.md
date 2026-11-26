# CommitErrorCode

```ts
const CommitErrorCode: object;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts#L36)

The commit capability's stable error codes

## Type Declaration

### ambiguous\_active\_branch \{#ambiguous_active_branch\}

```ts
readonly ambiguous_active_branch: "ambiguous_active_branch" = 'ambiguous_active_branch';
```

Found more than one row of `RxDBBranch.activated` that is true.

#### Remarks

When the first enable migration hits this, the entire migration rolls back — **it does not guess one by
query order** (FR-048). "Take the first by order" is not fault tolerance but rolling dice: with two active
rows there is no answer to which branch the user's uncommitted entries hang on, and the wrongly guessed half
would be written into the commit graph as "another branch's history".

Zero active rows does not use this code; it uses [CommitErrorCode.no\_active\_branch](#no_active_branch).

`activationRevision` only guards against concurrent switches and **cannot replace** this cardinality
invariant: it can tell you "a switch happened", not "there are two actives right now".

### branch\_not\_materializable \{#branch_not_materializable\}

```ts
readonly branch_not_materializable: "branch_not_materializable" = 'branch_not_materializable';
```

During the first enable migration, a **local** branch cannot be materialized gap-free along the `RxDBChange` chain.

#### Remarks

The migration **fails as a whole**, leaving no partially enabled state (FR-049). Causes of a broken chain
include already-cleaned changes, compacted ranges, and rollback markers that cannot be balanced. The judgment
reuses the existing branch materialization path; a second replay engine MUST NOT be written just for the migration.

The only exception is metadata-only remote branches: they do **not** get a baseline or `CommitBranchRef`
created here, nor does this count as a failure — their first materialization belongs to US-308, and the
failure code is [CommitErrorCode.branch\_not\_materialized](#branch_not_materialized).

### branch\_not\_materialized \{#branch_not_materialized\}

```ts
readonly branch_not_materialized: "branch_not_materialized" = 'branch_not_materialized';
```

Insufficient materialization basis on the **first switch** to a metadata-only remote branch.

#### Remarks

This and [CommitErrorCode.branch\_not\_materializable](#branch_not_materializable) are two moments and two
subjects and are not interchangeable: the former is a materializability judgment on existing **local**
branches at migration time; the latter is one materialization attempt on a **remote** metadata-only branch
at runtime.

Rolls back entirely, the source branch stays active, and **no partial target projection is left behind**;
only durable staging that can be safely retried / cleaned up per attempt remains (FR-044). Causes include
network failures, sync scope drift, insufficient quota, and non-convergence.

### commit\_capability\_disabled \{#commit_capability_disabled\}

```ts
readonly commit_capability_disabled: "commit_capability_disabled" = 'commit_capability_disabled';
```

A member other than `enable()` / `isEnabled()` was called on a database without the commit capability enabled.

#### Remarks

The opposite of "silently degrade to an empty implementation": when not enabled, the database's behavior
must be exactly that of v3 (FR-046), so these members can neither fake success nor return empty results —
they can only reject at the entrance.

### commit\_capability\_mismatch \{#commit_capability_mismatch\}

```ts
readonly commit_capability_mismatch: "commit_capability_mismatch" = 'commit_capability_mismatch';
```

A write bypassed working tree capture — the raw write path or a batch write method hit a versioned business
entity table.

#### Remarks

Three places share this code:

- step 3 of the adapter's four-step bypass judgment (target tables ∩ versioned business entity tables ≠ ∅
  **and** the written column set ⊄ the untracked field domain), see contracts/adapter-contract.md;
- `upsertMany()` / `deleteByIds()`, the two public batch write methods that cannot reach `rawQuery`;
- `EntityManager.notifyExternalUpdate()` on a versioned entity.

The rejection happens **before the statement executes**, leaving business tables untouched — it is not a
rollback after the write. When the target table or column set cannot be determined, it is treated as a
rejection (fail-closed), better a false positive than a miss.

The same code also covers "an enabled database encounters a writer that has not declared this capability or
has a protocol version mismatch" (FR-037): the two are the same thing — someone is writing to a versioned
business table raw.

### commit\_graph\_corrupted \{#commit_graph_corrupted\}

```ts
readonly commit_graph_corrupted: "commit_graph_corrupted" = 'commit_graph_corrupted';
```

Hit **reachable** corruption on the commit graph — each of the three entrances `commit()` / `restore()` /
switch-to reports it.

#### Remarks

"Reachable" means corruption that can be walked to from that branch's ref along the full parent chain.
Isolated corruption (not on any ref's reachable chain) is quarantined separately; other branches work as
usual and do **not** throw this code.

Reachable corruption puts the branch in `corrupted_read_only`: the current projection (which does not depend
on replay) can still be read, diagnostics can be exported, and the branch can be switched away from; but it
MUST NOT automatically fall back to an earlier commit, an empty working tree, or in-memory mode — that would
dress up "data corruption" as "the data is just like this". The judgment is implemented by the **shared
guard** FR-051 requires; the three entrances call the same one inside their own write transactions, each not
writing its own.

### mixed\_versioned\_cache\_transaction \{#mixed_versioned_cache_transaction\}

```ts
readonly mixed_versioned_cache_transaction: "mixed_versioned_cache_transaction" = 'mixed_versioned_cache_transaction';
```

QueryCache entities and other entities were mixed into the same transaction unit.

#### Remarks

Throwing **rolls back the entire transaction** (FR-046). The two write semantics are irreconcilable: other
entities write a local transaction; QueryCache entities write to the remote first and then land in a
discardable cache; the same batch would only end up "half in a local transaction, half already sent to the
remote". Entities with change logging disabled are also untracked, but they go through the local transaction
like versioned entities and are not among the rejected.

The carrier is the existing `RxDBMixedVersionedCacheTransactionError`, which predates this module.
`origin='remote_sync'` is **not** untracked — the origin does not change whether something is captured.

### no\_active\_branch \{#no_active_branch\}

```ts
readonly no_active_branch: "no_active_branch" = 'no_active_branch';
```

At runtime, no active branch row was found.

#### Remarks

This and [CommitErrorCode.ambiguous\_active\_branch](#ambiguous_active_branch) are the two sides of the same
cardinality invariant, but only this side is irreplaceable: "at most one" is enforced at the schema layer by
the unique constraint on `rxdb_branch.activeKey`, while "at least one" is a condition even an **empty table**
satisfies — no column constraint can express it.

Only **runtime** entrances throw this code. The migration does not: that side repairs using the existing
`resolve_current_branch` semantics (activate `main` if present, create it otherwise). The difference between
the two is not strictness but timing — migration is the only moment when "the database has no active branch
yet" is a normal state.

At runtime it MUST NOT be repaired on the side: "there is a `main`, so pretend nothing happened" would
silently move the user from `feature-x` to `main`, with uncommitted entries still hanging on `feature-x`
while the UI shows a clean, empty working tree.

### stale\_active\_branch \{#stale_active_branch\}

```ts
readonly stale_active_branch: "stale_active_branch" = 'stale_active_branch';
```

At write time, the caller's active branch token was found expired.

#### Remarks

The token is `{ branchId, activationRevision }`, captured by the caller's realm **when reading /
instantiating entities**; if another realm switched branches in the meantime, this write lands on the write
path carrying the old token (FR-020, spec.md scenario 5).

What is validated is **that captured token**. Re-reading the active branch inside the transaction and
re-assigning the old entities to it is a forbidden shape: it would never fail, at the cost of entities the
user edited on `feature-x` being written into `main` without any notice. Likewise, this correctness MUST NOT
rest on `BroadcastChannel` or in-memory state alone — neither survives a process restart.

The rejection happens **before the business write**, leaving business tables untouched. The division of
labor with [CommitErrorCode.no\_active\_branch](#no_active_branch): that one is "not a single active row",
this one is "there is an active, but not the one you think".

## Remarks

The values are the externally visible code strings: they go into logs, error reporting, and cross-realm
discrimination branches, and **must not be renamed**. Keys and values are character-for-character identical,
pinned by `__tests__/commit/commit-error-codes.spec.ts`.
