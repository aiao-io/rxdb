# UNTRACKED_BOOKKEEPING_FIELDS

```ts
const UNTRACKED_BOOKKEEPING_FIELDS: readonly string[] = ENTITY_BOOKKEEPING_FIELDS;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L49)

The second untracked category: bookkeeping fields on entity rows, exempt **globally**

## Remarks

The exemption's basis is "this column does not express user intent", regardless of whether the entity is
registered — which is why it is a global set rather than one registered per table. Backfilling them is an
UPDATE to entity rows, but it does not constitute a business net change.

**Why there is no "sync watermark" entry**: spec.md's triple is written as "`remoteId`, sync watermark,
audit timestamps", but in this repository the sync watermark lives in `rxdb_sync` (a system table, already
outside the versioned domain by target class), and **business entity rows have no watermark column at all**.
Reserving a slot for a nonexistent column name (`syncedAt` or the like) is not conservative but a hole: it
exempts nothing today, yet the day someone uses that name as a business field, that field silently drops out
of version control. If a per-row watermark really appears, add an entry here plus a test case — only then
does it have an object worth exempting.

**Why `createdBy` / `updatedBy` are not included**: spec.md says audit **timestamps**. Who performed the
audit is part of the same real net change as "what was written"; including it would keep "a different person
changes the same value" out of commits.

**Why `id` is not included**: the primary key is the row's identity, not its bookkeeping. Exempting it would
mean changing the primary key does not count as a change.

The list itself is the core's `ENTITY_BOOKKEEPING_FIELDS` (the same reference): the history plugin's branch
comparison and merge preview use the same list to exclude these columns from diffs, and two separately
maintained copies would inevitably diverge.
