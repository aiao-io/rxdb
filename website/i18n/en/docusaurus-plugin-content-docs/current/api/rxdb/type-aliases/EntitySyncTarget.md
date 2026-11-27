# EntitySyncTarget

```ts
type EntitySyncTarget = EntityType | EntityMetadata;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L17)

The resolution target: an entity class or its metadata.

## Remarks

Both forms are accepted: pass whatever the call site happens to hold. Sync plugins usually only hold the metadata
(pulled out of the schema manager), while repositories and bulk writes hold the entity class. Matching is by
`namespace` + `name`, not by metadata object identity: calls like `transitionMetadata()` produce a new object every
time, and identity-based lookup would silently drop overrides. Same-named entities in different namespaces are still
two targets (US-026); within one instance the pair is unique, guaranteed by the schema manager's name-collision
validation.
