# WorkingTreeDiffTransaction

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L106)

A group of units at transaction granularity.

## Remarks

Units with a `null` `transactionId` **each form their own group**, not merged into one "no transaction" bucket: merging into one bucket claims two unrelated `save()` calls belong to the same atomic operation, and what the user sees in the UI is "undo this group".

## Properties

### entries \{#entries\}

```ts
readonly entries: readonly WorkingTreeDiffEntry[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L111)

The units in the group, in the order they were read

***

### transactionId \{#transactionid\}

```ts
readonly transactionId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L108)

This group's transaction id; `null` means this group holds only one independent write
