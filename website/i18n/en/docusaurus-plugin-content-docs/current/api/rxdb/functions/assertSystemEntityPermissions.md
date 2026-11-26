# assertSystemEntityPermissions()

```ts
function assertSystemEntityPermissions(systemEntities): void;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L180)

Asserts that all three write operations of every system table are declared as `'system'`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `systemEntities` | readonly [`EntityType`](../type-aliases/EntityType.md)[] | The list of system tables for this instance (the four core tables + plugin contributions) |

## Returns

`void`

## Throws

[RxDBError](../classes/RxDBError.md) when a table is missing a declaration; the message names each table and the operation it is missing

## Remarks

System tables rely on **explicit declarations** rather than "automatically tighten because it is a system table": automatic tightening would leave plugin authors unable to see what
constraints their tables are subject to, while UI hiding and the facade's interception both read the same declarations. A missing entry breaks right here, instead of letting
the user delete a sync watermark row in the entity management UI.
