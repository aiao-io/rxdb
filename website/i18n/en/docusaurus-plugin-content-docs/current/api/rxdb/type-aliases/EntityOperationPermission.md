# EntityOperationPermission

```ts
type EntityOperationPermission = 'both' | 'system';
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L55)

Who a single write operation is open to

- `'both'`: both users and the system (default)
- `'system'`: only the system may write; user writes through the facade `Repository` are blocked

## Remarks

`'none'` (nobody may write) is not supported: true immutability must be backed by SQL triggers; the facade layer
alone cannot stop sync, migration, and direct adapter writes, so declaring it would only be an illusion. `'user'`
(only users, not the system) is not supported either: in the layered model "the system" is exactly the adapter and
executor paths below the facade, and that layer has no way to tell whether a given direct write expresses "the user's
intent".
