# VersionedEntityClass

```ts
type VersionedEntityClass = 'tracked' | 'untracked';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L61)

The classification of an entity within the versioned domain

## Remarks

Only two values, because "partially tracked" cannot be expressed: an entity's net changes can either be
replayed or not. Field-level exemptions are handled by
[VersionedDomain.isUntrackedField](../interfaces/VersionedDomain.md#isuntrackedfield), not at this layer.
