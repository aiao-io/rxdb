# EntityMetadataResolver

```ts
type EntityMetadataResolver = (entity, namespace) => EntityMetadata | undefined;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L191)

Looks up registered entity metadata by `entity` / `namespace`.

## Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `entity`    | `string` |
| `namespace` | `string` |

## Returns

[`EntityMetadata`](EntityMetadata.md) \| `undefined`

## Remarks

Returning `undefined` means the target is not registered; [describeEntityFields](../functions/describeEntityFields.md)
throws as a result, and does not degrade into guessing the primary key type.
