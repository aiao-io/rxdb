# WorkingTreePatchCodecContext

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L61)

The two metadata resolvers the codec needs.

## Remarks

The two look up **different** things, don't merge them:

- [WorkingTreePatchCodecContext.resolveTargetMetadata](CommitPatchCodecContext.md#resolvetargetmetadata) looks up the entity the patch belongs to
  (given by the row's `namespace` / `entity`), usually just `schemaManager.getEntityMetadata`;
- [WorkingTreePatchCodecContext.resolveEntityMetadata](CommitPatchCodecContext.md#resolveentitymetadata) looks up the **foreign-key peer** entity,
  called only when a foreign-key column is not found in the target entity's `propertyMap`, and can simply be the adapter's
  `encryptionContext.resolveEntityMetadata`.

## Extended by

- [`CommitPatchCodecContext`](CommitPatchCodecContext.md)

## Properties

### resolveEntityMetadata? \{#resolveentitymetadata\}

```ts
readonly resolveEntityMetadata?: RxDBChangeEntityMetadataResolver;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L65)

Reverse-resolves the peer entity's metadata for foreign-key columns; when absent, foreign-key columns are handled as this entity's declared type

***

### resolveTargetMetadata \{#resolvetargetmetadata\}

```ts
readonly resolveTargetMetadata: (entity, namespace) => 
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L63)

Resolves the patch's owning entity's metadata by `(entity, namespace)`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `string` |
| `namespace` | `string` |

#### Returns

  \| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;
  \| `undefined`
