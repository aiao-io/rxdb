# PG_MAX_PARAMS

```ts
const PG_MAX_PARAMS: 65535 = 65535;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L193)

Maximum number of parameters per query in the PostgreSQL protocol (int16). Large bulk data is sliced by column count to avoid exceeding the limit in INSERT ... VALUES (...).
