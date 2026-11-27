# TrustedWriteIntent

```ts
const TrustedWriteIntent: object;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L60)

Write intents declared on the trusted path.

## Type Declaration

### branch\_materialization \{#branch_materialization\}

```ts
readonly branch_materialization: "branch_materialization" = 'branch_materialization';
```

Materializing the target branch's state into business tables during a branch switch (#1 ordinary switch / #10 #11 metadata-only takeover); a projection rewrite, produces no units.

### merge\_per\_change \{#merge_per_change\}

```ts
readonly merge_per_change: "merge_per_change" = 'merge_per_change';
```

The per-change strategy of a branch merge (#5).

### merge\_squash \{#merge_squash\}

```ts
readonly merge_squash: "merge_squash" = 'merge_squash';
```

The squash strategy of a branch merge (#6); occupies its own row alongside the per-change strategy.

### redo\_invalidation \{#redo_invalidation\}

```ts
readonly redo_invalidation: "redo_invalidation" = 'redo_invalidation';
```

Marker rewrite when a new write invalidates the redo stack (#3); a projection rewrite, produces no units.

### remote\_sync \{#remote_sync\}

```ts
readonly remote_sync: "remote_sync" = 'remote_sync';
```

The sync mechanism writing to local business projections (#7/#8/#9/#12); produces units with `origin='remote_sync'`.

### restore\_entity \{#restore_entity\}

```ts
readonly restore_entity: "restore_entity" = 'restore_entity';
```

Restoring an entity to a historical state (#2); user-initiated, must produce units.

### undo\_redo \{#undo_redo\}

```ts
readonly undo_redo: "undo_redo" = 'undo_redo';
```

Applying undo / redo history (#4); user-initiated, must produce units.

## Remarks

A different dimension from [WriteEntrance](../type-aliases/WriteEntrance.md), and the two cannot be merged: the intent is the **identity a callsite reports for itself** (a column of the registry), while the entrance is the **classification the matrix gives**. They are many-to-one — the four rows #7/#8/#9/#12 all report `remote_sync`, yet fall into the two entrances `remote_entity_apply` and `cleanup_expired` respectively. Collapsing them into one enum would leave the registry unable to express "the same intent in two places" — which is exactly what the drift scan needs to compare.
