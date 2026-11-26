# ActiveBranchToken

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L267)

The active branch identity captured by the caller **when reading / instantiating entities** (FR-020).

## Remarks

Both fields are indispensable: `branchId` identifies "which branch", `activationRevision` identifies "which activation".
With only `branchId`, after a round trip of `main → feature → main` the token would "match" again, while the working tree had already been swapped twice in between.

## Properties

### activationRevision \{#activationrevision\}

```ts
readonly activationRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L272)

The activation revision at capture time; +1 on every branch switch

***

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L269)

The active branch ID at capture time
