# ENTITY_BOOKKEEPING_FIELDS

```ts
const ENTITY_BOOKKEEPING_FIELDS: readonly string[];
```

Defined in: [packages/rxdb/src/entity/entity-bookkeeping.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-bookkeeping.ts#L16)

Bookkeeping fields on an entity row that express no user intent: the sync-backfilled `remoteId` and the audit timestamps `createdAt` / `updatedAt`.

## Remarks

These columns are defined by the core (audit timestamps of the entity base class, the remote id backfilled by sync), so the list lives in the core as well. Both plugins judge by the same list: the working tree plugin treats them as untracked (`UNTRACKED_BOOKKEEPING_FIELDS` is this very constant), and the history plugin's branch comparison and merge preview do not count them as differences or overwrites. If each side maintained its own copy, sooner or later one side would add a new column and the other would not follow.

Does not include `createdBy` / `updatedBy`: who wrote the audit entry is part of the same real net change as what was written. Does not include `id`: the primary key is the identity of a row, not its bookkeeping.
