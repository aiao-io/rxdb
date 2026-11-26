# TreeEntityType

```ts
type TreeEntityType = IEntityStaticType & (new (...args) => ITreeEntity);
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L43)

Tree entity type

Inherits the `id` / `createdAt` and other fields of [IEntity](../../rxdb/interfaces/IEntity.md), plus tree-specific properties such as `parentId` and `hasChildren`. [TreeRepository](../classes/TreeRepository.md) provides methods like `findDescendants` / `countAncestors` based on it.
