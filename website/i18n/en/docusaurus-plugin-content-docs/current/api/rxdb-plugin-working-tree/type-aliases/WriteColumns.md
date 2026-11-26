# WriteColumns

```ts
type WriteColumns =
  | {
      kind: 'whole_row';
    }
  | {
      kind: 'unknown';
    }
  | {
      kind: 'columns';
      names: readonly string[];
    };
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L50)

Which columns this write touched

## Union Members

### Type Literal

```ts
{
  kind: 'whole_row';
}
```

The whole row is replaced: the shape of batch write primitives and upserts — **never** an untracked subset

#### kind

```ts
readonly kind: "whole_row";
```

The discriminator: whole-row replacement

---

### Type Literal

```ts
{
  kind: 'unknown';
}
```

The written columns cannot be resolved: treated as "not an untracked subset" (fail-closed)

#### kind

```ts
readonly kind: "unknown";
```

The discriminator: the written columns cannot be resolved

---

### Type Literal

```ts
{
  kind: "columns";
  names: readonly string[];
}
```

An explicit set of written column names; an empty array is a semantic no-op

#### kind

```ts
readonly kind: "columns";
```

The discriminator: the written columns are known

#### names

```ts
readonly names: readonly string[];
```

The written column names; an empty array is a semantic no-op, the opposite conclusion of `whole_row`

## Remarks

Three states rather than "an array that may be empty": `whole_row` (the whole row is replaced) and
`columns: []` (not a single column was written) are semantically opposite, and `unknown` (cannot be resolved)
differs from both. Compressed into an array, `[]` would have to express three things at once, two of which
have opposite correct conclusions.
