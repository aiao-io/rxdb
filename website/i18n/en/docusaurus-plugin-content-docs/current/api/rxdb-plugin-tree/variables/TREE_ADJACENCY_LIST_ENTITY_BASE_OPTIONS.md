# TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS

```ts
const TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: EntityMetadataOptions;
```

Defined in: [rxdb-plugin-tree/src/constants.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/constants.ts#L56)

The `@Entity` metadata of `TreeAdjacencyListEntityBase`.

## Remarks

The declaration for the adjacency-list model: the `parentId` foreign key, the `children` one-to-many self-relation, the `hasChildren` computed property, and `repository: 'TreeRepository'`. Subclasses inherit the whole thing along the prototype chain, so `@Entity({ name: 'Category' })` gets tree capabilities without redeclaring anything.

Exported rather than inlined into the decorator because the `@TreeEntity` decorator needs it to merge with the user's own options, and hand-written entities (that do not extend the base class but implement [ITreeEntity](../interfaces/ITreeEntity.md) themselves) need it to align their fields — both paths must use the same declaration, otherwise the "inherited tree" and the "hand-written tree" would fork at the schema level.

Living in this module — which contains no decorators and no rxjs — is what lets the `/generator` subpath read it without importing [TreeAdjacencyListEntityBase](../classes/TreeAdjacencyListEntityBase.md) — the generator only runs at build time.

## See

[TreeAdjacencyListEntityBase](../classes/TreeAdjacencyListEntityBase.md)
