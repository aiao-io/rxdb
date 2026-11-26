# isStaleEntityEvent()

```ts
function isStaleEntityEvent<T>(rxdb, event): boolean;
```

Defined in: [packages/rxdb/src/query/stale-event.utils.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/stale-event.utils.ts#L62)

Determines whether an entity change event is stale relative to the entity cache.

Returns `false` when the entity is absent from the cache — there is nothing to compare against, and the event is then the only source of information.
The `patch` of a DELETE event is `null`, which likewise falls into "cannot judge → do not block".

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../classes/RxDB.md) | The RxDB instance, used to resolve the entity type and read the entity cache |
| `event` | [`RxDBEntityLocalEventData`](../type-aliases/RxDBEntityLocalEventData.md)&lt;`T`&gt; | The local entity change event |

## Returns

`boolean`
