# WorkingTreeDiffOptions

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L44)

The options of one `diff()` call (contracts/core-api.md §3).

## Remarks

**The key set is closed**: none of the four keys points at a second comparison side. Before adding a key, answer
"would it let callers ask a question that `commit()` cannot act on" — `from` / `to` / `ref` all would, which is why they are not here.

## Properties

### cursor? \{#cursor\}

```ts
readonly cursor?: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L55)

The previous page's [WorkingTreeDiff.nextCursor](WorkingTreeDiff.md#nextcursor); read on from after it. **Only available with `granularity: 'entity'`**

***

### entities? \{#entities\}

```ts
readonly entities?: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L49)

Only look at these entity names; an empty array means "look at none", not "no filter"

***

### granularity? \{#granularity\}

```ts
readonly granularity?: WorkingTreeDiffGranularity;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L46)

The granularity to spread out at, defaults to `'entity'`

***

### limit? \{#limit\}

```ts
readonly limit?: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L52)

At most how many rows this page returns; when omitted, everything at once. **Only available with `granularity: 'entity'`**
