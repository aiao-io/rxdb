# EntityForeignKeyMetadata

```ts
type EntityForeignKeyMetadata = SetRequired<EntityForeignKeyMetadataOptions, 'mappedNamespace'>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:597](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L597)

Entity-level foreign-key metadata after normalization

## Remarks

Its relationship with [EntityForeignKeyMetadataOptions](../interfaces/EntityForeignKeyMetadataOptions.md) is the same as that of
[EntityPropertyMetadata](EntityPropertyMetadata.md): `transitionMetadata()` fills the defaulted `mappedNamespace` with the
current entity's namespace, so downstream cross-namespace resolution no longer needs to know the "default inherits"
rule.
