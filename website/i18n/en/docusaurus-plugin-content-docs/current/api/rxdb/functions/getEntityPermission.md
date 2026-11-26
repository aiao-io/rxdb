# getEntityPermission()

```ts
function getEntityPermission(metadata, operation): EntityOperationPermission;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L44)

Reads the entity's permission for a write operation.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | `Pick`&lt;[`EntityMetadata`](../type-aliases/EntityMetadata.md), `"permissions"`&gt; | The entity metadata |
| `operation` | [`EntityOperation`](../type-aliases/EntityOperation.md) | The write operation |

## Returns

[`EntityOperationPermission`](../type-aliases/EntityOperationPermission.md)

The declared value; `'both'` when the entire prototype chain declares nothing
