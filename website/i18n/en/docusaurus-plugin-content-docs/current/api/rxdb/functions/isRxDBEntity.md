# isRxDBEntity()

```ts
function isRxDBEntity<T>(target): target is InstanceType<T>;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L116)

Checks whether something is an RxDB entity.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | `unknown` | The object to check |

## Returns

`target is InstanceType<T>`

Returns `true` if it is an entity, otherwise `false`.

## Remarks

This is the **only** entry that must "not throw when the lookup misses", so it does not go through [getEntityStatus](getEntityStatus.md) but reads the `STATUS` slot directly itself. The return value was also changed from `target && ...` (which echoes the input back on falsy values) to a real `boolean`, and it is declared as a type guard.
