# ActiveBranchToken

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L267)

The active branch identity the caller captured **when reading / instantiating an entity** (FR-020)

## Remarks

The two fields are both indispensable: `branchId` says "which branch", `activationRevision` says "which activation". With only `branchId`, after one `main → feature → main` round trip the token "matches" again — while the working tree has been swapped twice in between.

## Properties

### activationRevision \{#activationrevision\}

```ts
readonly activationRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L272)

The activation revision at capture time; +1 per branch switch

---

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L269)

The active branch ID at capture time
