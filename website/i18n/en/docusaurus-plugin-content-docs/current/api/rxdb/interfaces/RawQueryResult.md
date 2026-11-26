# RawQueryResult

Defined in: [packages/rxdb/src/rxdb-adapter.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L257)

The return shape of [IRxDBAdapter.rawQuery](IRxDBAdapter.md#rawquery)

## Remarks

Rows are a **two-dimensional array**, not an array of objects: the column names of a raw query are decided by the SQL itself,
and the adapter has no metadata to name them by; column names live separately in `columns`, one-to-one with each row's indices. Callers wanting object shape must zip it themselves.

Write statements (UPDATE / DELETE) only fill `rowsAffected`; `rows` and `columns` are empty.

## Properties

### columns \{#columns\}

```ts
columns: string[];
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L260)

***

### rows \{#rows\}

```ts
rows: unknown[][];
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L259)

***

### rowsAffected \{#rowsaffected\}

```ts
rowsAffected: number;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L258)
