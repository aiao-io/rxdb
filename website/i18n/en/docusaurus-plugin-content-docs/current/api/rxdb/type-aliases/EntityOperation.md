# EntityOperation

```ts
type EntityOperation = 'create' | 'update' | 'delete';
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L42)

The write operations constrained by permissions

## Remarks

Only these three: reads are not in the model — read permissions have no enforceable meaning on a local database, the data is already in the user's hands.
