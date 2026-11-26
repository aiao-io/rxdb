# CommitErrorCode

```ts
const CommitErrorCode: object;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts#L36)

Stable error codes of the commit capability

## Type Declaration

### ambiguous\_active\_branch \{#ambiguous_active_branch\}

```ts
readonly ambiguous_active_branch: "ambiguous_active_branch" = 'ambiguous_active_branch';
```

Found `RxDBBranch.activated` with more than one row true.

#### Remarks

The first-enable migration rolls back the whole migration on a hit, and does **not guess one by query order** (FR-048). "Take the first one by order"
is not fault tolerance but rolling dice: with two active rows there is no answer to which branch the user's uncommitted entries hang on,
and the wrongly guessed half would be written into the commit graph as "another branch's history".

Zero active rows does not use this code; it uses [CommitErrorCode.no\_active\_branch](#no_active_branch).

`activationRevision` only guards against concurrent switches and **cannot replace** this cardinality invariant: it can tell you "a switch happened",
not "there are now two actives".

### branch\_not\_materializable \{#branch_not_materializable\}

```ts
readonly branch_not_materializable: "branch_not_materializable" = 'branch_not_materializable';
```

During the first-enable migration, some **local** branch cannot be materialized gap-free along the `RxDBChange` chain.

#### Remarks

The migration **fails as a whole** and leaves no partial enabled state (FR-049). Causes of a broken chain include cleaned-up changes,
compacted ranges, and rollback markers that cannot be balanced. The judgment reuses the existing branch materialization path; MUST NOT write
a second replay engine for the migration.

The only exception is metadata-only remote branches: no baseline or `CommitBranchRef` is created for them at this point,
and they do not cause failure — their first materialization belongs to US-308, with failure code
[CommitErrorCode.branch\_not\_materialized](#branch_not_materialized).

### branch\_not\_materialized \{#branch_not_materialized\}

```ts
readonly branch_not_materialized: "branch_not_materialized" = 'branch_not_materialized';
```

Insufficient materialization evidence at the **first switch** to a metadata-only remote branch.

#### Remarks

Two different times and two different subjects from [CommitErrorCode.branch\_not\_materializable](#branch_not_materializable); not interchangeable:
the former is the migration-time materializability judgment on an existing **local** branch, the latter is a runtime materialization attempt on a **remote** metadata-only
branch.

Full rollback; the source branch stays active and **no partial target projection is left behind**; only durable staging that can be safely retried / cleaned up by
attempt is kept (FR-044). Causes include network failures, sync scope drift, insufficient quota, and non-convergence.

### commit\_capability\_disabled \{#commit_capability_disabled\}

```ts
readonly commit_capability_disabled: "commit_capability_disabled" = 'commit_capability_disabled';
```

A member other than `enable()` / `isEnabled()` was called on a database without commit capability enabled.

#### Remarks

The opposite of "silently degrade to an empty implementation": when not enabled, the database's behavior must be exactly identical to v3 (FR-046),
so these members can neither pretend to succeed nor return empty results; they can only reject at the entrance.

### commit\_capability\_mismatch \{#commit_capability_mismatch\}

```ts
readonly commit_capability_mismatch: "commit_capability_mismatch" = 'commit_capability_mismatch';
```

A write bypassed working tree capture — a raw write path or a bulk write method hit a versioned business entity table.

#### Remarks

Three places share this code:

- step 3 of the adapter's 4-step bypass judgment (written target tables ∩ versioned business entity tables ≠ ∅ **and**
  the written column set ⊄ the untracked field domain), see contracts/adapter-contract.md;
- `upsertMany()` / `deleteByIds()`, the two public bulk write methods that cannot reach `rawQuery`;
- `EntityManager.notifyExternalUpdate()` on a versioned entity.

The rejection happens **before the statement executes**; business tables are completely unchanged — not write-then-rollback. When the target table or column set cannot be determined,
treat as reject (fail-closed), better to misfire.

The same code is also used for "an enabled database encounters a writer that does not declare this capability or has a protocol version mismatch" (FR-037):
the two are the same thing — someone is raw-writing a versioned business table.

### commit\_graph\_corrupted \{#commit_graph_corrupted\}

```ts
readonly commit_graph_corrupted: "commit_graph_corrupted" = 'commit_graph_corrupted';
```

Hit **reachable** corruption on the commit graph — each of the three entrances `commit()` / `restore()` / switch-to returns it.

#### Remarks

"Reachable" means corruption reachable from that branch's ref along the full parent chain. Isolated corruption (not on any ref's reachable chain)
is quarantined separately, other branches keep working, and this code is **not thrown**.

Reachable corruption puts that branch into `corrupted_read_only`: its current projection that does not depend on replay can still be read, diagnostics exported,
and the branch switched away from; but it MUST NOT automatically fall back to an earlier commit, an empty working tree, or in-memory mode — that would disguise
"data corruption" as "the data is just like this". The judgment is implemented by the **shared guard** required by FR-051;
the three entrances call the same one inside their own write transactions, not one copy each.

### mixed\_versioned\_cache\_transaction \{#mixed_versioned_cache_transaction\}

```ts
readonly mixed_versioned_cache_transaction: "mixed_versioned_cache_transaction" = 'mixed_versioned_cache_transaction';
```

QueryCache entities and other entities were mixed into the same transaction unit.

#### Remarks

Throwing **rolls back the whole transaction** (FR-046). The write semantics of the two are irreconcilable: other entities write local transactions,
QueryCache entities write to the remote first and then land in a discardable cache; the same batch would only get "half into the local transaction, half already sent to the remote".
Entities with change logging disabled are also untracked, but they go through local transactions together with versioned entities and are not among the rejected.

The carrier is the existing `RxDBMixedVersionedCacheTransactionError`, which predates this module.
`origin='remote_sync'` is **not** untracked — the origin does not change whether it is captured.

### no\_active\_branch \{#no_active_branch\}

```ts
readonly no_active_branch: "no_active_branch" = 'no_active_branch';
```

At runtime, found not one active branch row.

#### Remarks

The two sides of the same cardinality invariant as [CommitErrorCode.ambiguous\_active\_branch](#ambiguous_active_branch), but only
this side is irreplaceable: "at most one" is blocked at the schema layer by the unique constraint on `rxdb_branch.activeKey`,
while "at least one" is a condition that an **empty table** also satisfies, inexpressible by any column constraint.

Only **runtime** entrances throw this code. The migration period does not: that side follows the existing `resolve_current_branch` semantics
to repair (activate `main` first, create it if absent). The difference between the two is not strictness but timing — migration is the only
moment when "the database has no active branch yet" is a normal state.

Runtime MUST NOT repair on the side: "there is a `main`, so it is fine" would silently move the user from `feature-x` to
`main`, with uncommitted entries still hanging on `feature-x` while the UI shows a clean empty working tree.

### stale\_active\_branch \{#stale_active_branch\}

```ts
readonly stale_active_branch: "stale_active_branch" = 'stale_active_branch';
```

At write time, found the active branch token held by the caller has expired.

#### Remarks

The token is `{ branchId, activationRevision }`, captured by the caller's realm at **entity read / instantiation** time;
another realm switched branches in between, and this write lands on the write path with the old token (FR-020, spec.md scenario 5).

What is validated is **that captured token**. Re-reading the active branch inside the transaction and re-homing the old entities is an explicitly forbidden
shape: it would never fail, at the cost of entities the user edited on `feature-x` being written into `main` with no hint whatsoever.
Likewise, MUST NOT rely on `BroadcastChannel` or in-memory state alone for this correctness — neither survives process restarts.

The rejection happens **before the business write**, business tables are completely unchanged. Division of labor with
[CommitErrorCode.no\_active\_branch](#no_active_branch): that one is "not one active row", this one is
"there is an active, but not the one you think".

## Remarks

The values are the externally visible code strings: they enter logs, error reporting, and cross-realm discrimination branches and **must not be renamed**.
Keys and values are verbatim identical, pinned by `__tests__/commit/commit-error-codes.spec.ts`.
