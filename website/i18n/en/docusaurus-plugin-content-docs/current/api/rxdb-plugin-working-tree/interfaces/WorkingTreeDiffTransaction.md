# WorkingTreeDiffTransaction

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L106)

A group of units at transaction granularity.

## Remarks

Units with `transactionId` of `null` are **each their own group**, not merged into one "no transaction" bucket: merging them into one bucket would claim that two unrelated `save()` calls belong to the same atomic operation, and the UI would show the user "undo this group".

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

The transaction id of this group; `null` means this group contains only one independent write
