# BranchComparison

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L68)

The answer of `VersionManager.compareBranches()`.

## Properties

### entries \{#entries\}

```ts
readonly entries: readonly BranchDiffEntry[];
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L76)

The differing entities, ordered by `namespace:entity:entityId`; an empty array when both sides are identical

---

### fromBranchId \{#frombranchid\}

```ts
readonly fromBranchId: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L70)

The start branch

---

### toBranchId \{#tobranchid\}

```ts
readonly toBranchId: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L73)

The end branch
