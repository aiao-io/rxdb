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

The whole row is replaced: the shape of bulk write primitives and upsert; **never** an untracked subset

#### kind

```ts
readonly kind: "whole_row";
```

Discriminator: whole-row replacement

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

Discriminator: the written columns cannot be resolved

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

Discriminator: the written columns are known

#### names

```ts
readonly names: readonly string[];
```

Names of the written columns; an empty array is a semantic no-op, the opposite conclusion of `whole_row`

## Remarks

Three states rather than "one possibly-empty array": `whole_row` (whole-row replacement) and `columns: []` (no column written)
are semantically opposite, and `unknown` (cannot be resolved) differs from both. Compressed into an array, `[]` would have to express three things,
and two of them have opposite correct conclusions.
