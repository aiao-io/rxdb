# getEntityStatus()

```ts
function getEntityStatus<T>(target): EntityStatus<T>;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L99)

Gets the status of an entity.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | `object` | The entity instance |

## Returns

[`EntityStatus`](../interfaces/EntityStatus.md)&lt;`T`&gt;

The entity status object.

## Throws

RxDBError When `target` is not a mounted entity instance.

## Remarks

The old implementation was `target && target[STATUS]`: on falsy `target` it returned **`target` itself** (`null` / `undefined` / `0` / `''`), yet was declared as `EntityStatus<T>`. Only [isRxDBEntity](isRxDBEntity.md) needs "probe" semantics, and it now reads the slot directly itself, so this function can fail fast honestly.

The parameter is written as `object` rather than the instance type: `T` cannot be inferred from the parameter at all (the instance type is a conditional type — a non-inferable position), and the old `InstanceType<T>` only looked precise — it was always `any`, neither constraining the input nor keeping the return value at each callsite from spreading into `any`. What actually determines `T` has always been the explicit type argument or the default constraint; `object` says that plainly.
