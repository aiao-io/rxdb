# ROW_SERIES_COL_OFFSET

```ts
const ROW_SERIES_COL_OFFSET: 1 = 1;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/vtable-compat.d.ts:13

The VTable rowSeriesNumber column occupies col=0, so data columns start at col=1.
Subtract this offset when mapping VTable column indexes to `columns` array indexes.
