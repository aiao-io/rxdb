# ROW_SERIES_COL_OFFSET

```ts
const ROW_SERIES_COL_OFFSET: 1 = 1;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts#L15)

The VTable rowSeriesNumber column occupies col=0; data columns start at col=1.
Subtract this offset when mapping VTable column indexes to the columns array index.
