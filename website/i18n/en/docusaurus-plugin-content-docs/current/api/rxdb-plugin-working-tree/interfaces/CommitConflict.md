# CommitConflict

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L53)

The typed diagnosis of a rejected commit / discard (contracts/core-api.md §4.1).

## Remarks

**The key set is exactly four, with no extension slot.** One more field is one more thing that can be casually written into some table,
and this value's entire design premise is that it is never persisted. Callers who want more context already hold the full inputs and
a fresh `status()`; the database does not need to remember it for them.

The "suggested action" is not a field: the way out is the same for all three kinds — call `status()` again, let the user review,
and commit once more. Making it a string field would only tempt callers to display it directly to users.

## Properties

### actual \{#actual\}

```ts
readonly actual: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L61)

The current value read within the transaction

---

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L64)

The **current** active branch id; when it differs from the captured branch, this is evidence that the caller got the branch wrong

---

### expected \{#expected\}

```ts
readonly expected: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L58)

The value captured by the caller

---

### kind \{#kind\}

```ts
readonly kind: CommitConflictKind;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L55)

Which comparison failed; see [CommitConflictKind](../type-aliases/CommitConflictKind.md)
