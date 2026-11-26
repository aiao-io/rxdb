# findCheckByConstraintName()

```ts
function findCheckByConstraintName(metadata, constraintName): 
  | EntityCheckMetadataOptions
  | undefined;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:496](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L496)

Looks up the CHECK declared in the entity metadata by constraint name (shared by drift comparison and violation normalization).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |
| `constraintName` | `string` |

## Returns

  \| [`EntityCheckMetadataOptions`](../interfaces/EntityCheckMetadataOptions.md)
  \| `undefined`

The declaration matching the constraint name; `undefined` when nothing was declared (or compilation failed).
