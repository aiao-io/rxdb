# MergePreviewEntry

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L100)

An entity a merge would land on the target branch.

## Properties

### conflict \{#conflict\}

```ts
readonly conflict:
  | MergePreviewConflict
  | null;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L122)

The annotation when the merge hits changes made on the target since the fork; `null` when it does not

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L105)

Entity name

---

### entityId \{#entityid\}

```ts
readonly entityId: RxDBEntityId;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L108)

Entity primary key

---

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L119)

The target branch's current value: the fields the patch touches for UPDATE, the whole row for DELETE and INSERT; `null` when the target has no such entity

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L102)

Entity namespace

---

### operation \{#operation\}

```ts
readonly operation: BranchDiffOperation;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L111)

The operation the merge would land

---

### patch \{#patch\}

```ts
readonly patch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L114)

The value the merge would write, identical to what `mergeBranch()` writes: the whole row for INSERT, the patch for UPDATE, `null` for DELETE
