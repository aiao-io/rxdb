# UNTRACKED_BOOKKEEPING_FIELDS

```ts
const UNTRACKED_BOOKKEEPING_FIELDS: readonly string[] = ENTITY_BOOKKEEPING_FIELDS;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L49)

The second untracked category: bookkeeping fields on entity rows, exempt **globally**

## Remarks

The exemption is based on "this column does not express user intent", independent of whether the entity is registered — so it is a global set,
not registered per table. Backfilling them is an UPDATE on the entity row, but it does not constitute a business net change.

**Why there is no "sync watermark" entry**: spec.md's triple is written as "`remoteId`, sync watermark, audit timestamps",
but in this repository the sync watermark lives in `rxdb_sync` (a system table, already outside the versioned domain by target class), and **business entity rows have
no watermark column at all**. Reserving a placeholder for a nonexistent column name (something like `syncedAt`) is not conservative but opening a hole: it exempts
nothing today, yet on the day someone uses that name as a business field, that field silently exits version control. When a per-row watermark really appears,
add an entry here plus a test case — only then does it have an exemptable object.

**Why `createdBy` / `updatedBy` are not included**: spec.md says audit **timestamps**. Who wrote it
belongs to the same real net change as "what was written"; folding it in would mean "a different person changing the same value" does not enter commits.

**Why `id` is not included**: the primary key is the row's identity, not its bookkeeping. Exempting it would mean changing the primary key does not count as a change.

The list itself is the core's `ENTITY_BOOKKEEPING_FIELDS` (the same reference): the history plugin's branch comparison and merge previews exclude these columns from differences by the same
list; writing one copy in each place would eventually diverge.
