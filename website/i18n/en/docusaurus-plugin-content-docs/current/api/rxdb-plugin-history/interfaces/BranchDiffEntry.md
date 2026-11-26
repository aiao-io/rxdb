# BranchDiffEntry

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L47)

The difference of one entity between two branches.

## Remarks

`patch` / `inversePatch` share the semantics of the working tree `diff()` entries: the former is the value at the endpoint, the latter the value at the start point,
so UIs that render working tree diffs can render it as-is.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L52)

Entity name

---

### entityId \{#entityid\}

```ts
readonly entityId: RxDBEntityId;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L55)

Entity primary key

---

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L64)

The value at the start point: the whole row for DELETE, the same fields for UPDATE, `null` for INSERT

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L49)

Entity namespace

---

### operation \{#operation\}

```ts
readonly operation: BranchDiffOperation;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L58)

This entity's net operation going from the start point to the endpoint

---

### patch \{#patch\}

```ts
readonly patch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L61)

The value at the endpoint: the whole row for INSERT, the differing business fields for UPDATE, `null` for DELETE
