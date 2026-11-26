# assertEntityOperationAllowed()

```ts
function assertEntityOperationAllowed(EntityType, operation): void;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L139)

Judgment for a single public write entrance.

## Parameters

| Parameter    | Type                                                    | Description                    |
| ------------ | ------------------------------------------------------- | ------------------------------ |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md)           | The entity class being written |
| `operation`  | [`EntityOperation`](../type-aliases/EntityOperation.md) | The write operation            |

## Returns

`void`

## Throws

[PermissionDeniedError](../classes/PermissionDeniedError.md) The operation allows only system writes; the list contains exactly one item.
