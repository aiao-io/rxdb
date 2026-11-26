# RxDBEntityId

```ts
type RxDBEntityId = string | number | bigint;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L61)

The public runtime type of an RxDB entity primary key.

`bigint` primary keys must fit in the signed 64-bit range and are persisted only by local adapters that support the
type. `binary` is not allowed as a primary key.
