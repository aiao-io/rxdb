# MergePreview

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L136)

The reply of `VersionManager.previewMerge()`.

## Properties

### entries \{#entries\}

```ts
readonly entries: readonly MergePreviewEntry[];
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L156)

The entities the merge will land, sorted by `namespace:entity:entityId`.

#### Remarks

The per-entry strategy summarizes the final operations per entity. Entities that
were created then deleted on the source branch, and that also don't exist on the
target currently, produce no entries; a deletion is kept when the target
independently created an entity with the same primary key, because the merge
really will delete it.

---

### merged \{#merged\}

```ts
readonly merged: number;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L147)

Consistent with the `merged` returned by the subsequent `mergeBranch()`:
compressed to the net operation count, which per entry is the number of source
branch changes.

---

### sourceBranchId \{#sourcebranchid\}

```ts
readonly sourceBranchId: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L138)

The source branch.

---

### strategy \{#strategy\}

```ts
readonly strategy: MergeStrategy;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L144)

The strategy the preview is based on.

---

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L141)

The target branch: the current active branch.
