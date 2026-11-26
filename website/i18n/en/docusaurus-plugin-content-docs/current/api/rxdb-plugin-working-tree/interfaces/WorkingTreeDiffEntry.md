# WorkingTreeDiffEntry

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L70)

How one uncommitted unit looks in the diff.

## Remarks

The nine fields align one-to-one with `CommitChangeSet`'s nine columns — at commit time these units become the change set as-is, and mismatched field sets on the two sides would mean "what I see" and "what I commit" are not the same batch of data.

**Does not carry `sourceChangeId`.** It is diagnostics-only, and the `rxdb_change` row it points to can be taken away by branch-delete cascade, compaction merge and expiry cleanup; spreading it into the diff invites callers to use it as a replay data source.
Nor does it carry `id` or `fingerprint`: the former is the pagination cursor's internal carrier (see [WorkingTreeDiff.nextCursor](WorkingTreeDiff.md#nextcursor)),
the latter is for fold judgment — neither is part of "what changed this time".

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L81)

The entity name

***

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L84)

The entity primary key

***

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L93)

The inverse patch

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L78)

The entity namespace

***

### operation \{#operation\}

```ts
readonly operation: WorkingTreeEntryOperation;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L87)

The operation type

***

### origin \{#origin\}

```ts
readonly origin: WriteEntryOrigin;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L96)

The change origin; `remote_sync` is **not exempt** (hard ruling 6)

***

### patch \{#patch\}

```ts
readonly patch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L90)

The forward patch

***

### transactionId \{#transactionid\}

```ts
readonly transactionId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L75)

The owning transaction id; `null` for a single `save()`

***

### unitId \{#unitid\}

```ts
readonly unitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L72)

The change unit id; shared by all entities of the complete transaction
