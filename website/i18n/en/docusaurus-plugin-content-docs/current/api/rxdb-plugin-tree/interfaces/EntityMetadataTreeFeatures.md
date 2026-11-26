# EntityMetadataTreeFeatures

Defined in: [rxdb-plugin-tree/src/entity/tree-metadata.interface.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-metadata.interface.ts#L12)

Interface for tree structure features in entity metadata

## Properties

### hasChildren? \{#haschildren\}

```ts
hasChildren?: boolean;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-metadata.interface.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-metadata.interface.ts#L34)

Whether there are child nodes
Used within the tree structure; indicates whether the current node has child nodes

#### Default

```ts
false;
```

---

### type? \{#type\}

```ts
type?: "adjacency-list";
```

Defined in: [rxdb-plugin-tree/src/entity/tree-metadata.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-metadata.interface.ts#L27)

Tree structure type

Currently only adjacency-list is supported; other models may be supported in the future:

- 'closure-table': closure table model
- 'nested-set': nested set model
- 'materialized-path': materialized path model

References:

- https://www.slideshare.net/slideshow/models-for-hierarchical-data/4179181
- https://schinckel.net/2014/09/13/long-live-adjacency-lists/

#### Default

```ts
'adjacency-list';
```
