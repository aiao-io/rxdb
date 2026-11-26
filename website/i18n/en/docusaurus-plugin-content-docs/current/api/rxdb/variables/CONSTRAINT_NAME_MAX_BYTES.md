# CONSTRAINT_NAME_MAX_BYTES

```ts
const CONSTRAINT_NAME_MAX_BYTES: 63 = 63;
```

Defined in: [packages/rxdb/src/entity/constraint-name.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/constraint-name.ts#L27)

Maximum total length of a constraint name (in UTF-8 bytes): PostgreSQL identifiers are capped at 63 bytes; SQLite has no limit, but both sides must stay aligned.
