# CommitPatchCodecContext

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L94)

The context needed by commit-side patch codec and at-rest validation.

## Remarks

Adds only one item on top of [WorkingTreePatchCodecContext](WorkingTreePatchCodecContext.md):
[CommitPatchCodecContext.isEncryptedAtRest](#isencryptedatrest); the division of labor between the two metadata resolvers is unchanged, see the notes there.

## Extends

- [`WorkingTreePatchCodecContext`](WorkingTreePatchCodecContext.md)

## Properties

### isEncryptedAtRest? \{#isencryptedatrest\}

```ts
readonly isEncryptedAtRest?: CommitEncryptedAtRestRecognizer;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L102)

The at-rest shape recognizer; **absence does not mean pass**.

#### Remarks

May only be omitted when "this batch of patches has no encrypted-column values to judge at all". Once there is a value to judge and it is absent,
[assertCommitUnitsEncryptedAtRest](../functions/assertCommitUnitsEncryptedAtRest.md) throws [CommitEncryptedAtRestError](../classes/CommitEncryptedAtRestError.md).

***

### resolveEntityMetadata? \{#resolveentitymetadata\}

```ts
readonly resolveEntityMetadata?: RxDBChangeEntityMetadataResolver;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L65)

Looks up the peer entity metadata for foreign key columns; when omitted, foreign key columns are handled with the types already declared on this entity

#### Inherited from

[`WorkingTreePatchCodecContext`](WorkingTreePatchCodecContext.md).[`resolveEntityMetadata`](WorkingTreePatchCodecContext.md#resolveentitymetadata)

***

### resolveTargetMetadata \{#resolvetargetmetadata\}

```ts
readonly resolveTargetMetadata: (entity, namespace) => 
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-patch-codec.ts#L63)

Resolves the metadata of the entity a patch belongs to by `(entity, namespace)`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `string` |
| `namespace` | `string` |

#### Returns

  \| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;
  \| `undefined`

#### Inherited from

[`WorkingTreePatchCodecContext`](WorkingTreePatchCodecContext.md).[`resolveTargetMetadata`](WorkingTreePatchCodecContext.md#resolvetargetmetadata)
