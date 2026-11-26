# tryGetEntityStatus()

```ts
function tryGetEntityStatus<T>(target): EntityStatus<T> | undefined;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L131)

Probes for entity status: returns `undefined` when not found, does not throw.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | `unknown` | Any object; it is not required to be a mounted entity |

## Returns

[`EntityStatus`](../interfaces/EntityStatus.md)&lt;`T`&gt; \| `undefined`

The entity status object, or `undefined` when absent

## Remarks

Same as [tryGetEntityMetadata](tryGetEntityMetadata.md): after [getEntityStatus](getEntityStatus.md) became fail-fast,
call sites that **already had an `if (!status)` branch** should explicitly switch to this entry point —
their guards were previously invisible to the type system (the declaration said non-null),
and only after switching is the guard actually covered by type checking.
