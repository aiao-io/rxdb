# CommitConflict

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L53)

The typed diagnosis of one rejected commit / discard (contracts/core-api.md §4.1).

## Remarks

**The key set is exactly four, no extension slot.** One more field is one more thing that can be casually written into some table, and this value's entire design premise is that it never persists. Callers wanting more context already hold the complete input and a fresh `status()`, and don't need the library to remember it for them.

The "suggested action" is not made a field: the way out of all three kinds is the same — re-run `status()`, let the user review, submit again. Writing it as a string field only tempts callers to show it directly to users.

## Properties

### actual \{#actual\}

```ts
readonly actual: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L61)

The current value read inside the transaction

***

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L64)

The **current** active branch id; when it differs from the captured branch, this is evidence the caller got the wrong branch

***

### expected \{#expected\}

```ts
readonly expected: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L58)

The value the caller captured

***

### kind \{#kind\}

```ts
readonly kind: CommitConflictKind;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L55)

Which comparison failed; see [CommitConflictKind](../type-aliases/CommitConflictKind.md)
