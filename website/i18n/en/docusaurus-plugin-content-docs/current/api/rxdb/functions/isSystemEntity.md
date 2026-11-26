# isSystemEntity()

```ts
function isSystemEntity(EntityClass): boolean;
```

Defined in: [packages/rxdb/src/system/system-entities.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-entities.ts#L143)

Determines whether an entity class is a system table injected by RxDB

## Parameters

| Parameter     | Type                                          | Description              |
| ------------- | --------------------------------------------- | ------------------------ |
| `EntityClass` | [`EntityType`](../type-aliases/EntityType.md) | The entity class to test |

## Returns

`boolean`

`true` when it matches [SYSTEM\_ENTITIES](../variables/SYSTEM_ENTITIES.md)

## Remarks

System tables are **not integrator data**: they have no `sync` of their own, so in the eyes of [getSyncType](getSyncType.md) they follow the database-level configuration and get classified into the same sync type as business entities. Everywhere that "enumerates integrator repositories by sync type" must first pull them out with this predicate; otherwise, when the database-level configuration changes, system tables get swept into pipelines they never participate in.

## Example

```ts
isSystemEntity(RxDBBranch); // true
isSystemEntity(Recipe); // false
```
