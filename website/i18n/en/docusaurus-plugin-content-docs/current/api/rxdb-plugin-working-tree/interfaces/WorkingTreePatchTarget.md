# WorkingTreePatchTarget

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L42)

The two columns on a working tree entry row / commit change set used to locate the target entity.

## Remarks

A structural type rather than the union `WorkingTreeEntry | CommitChangeSet`: the two tables' two columns share the name and meaning,
and the codec needs only these two columns. Narrowing the input also lets the write path encode the patch **before** the entity object is constructed.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L46)

The target entity name

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L44)

The namespace of the target entity
