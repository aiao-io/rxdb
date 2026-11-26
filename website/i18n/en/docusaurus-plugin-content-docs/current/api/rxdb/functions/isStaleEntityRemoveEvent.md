# isStaleEntityRemoveEvent()

```ts
function isStaleEntityRemoveEvent<T>(rxdb, event): boolean;
```

Defined in: [packages/rxdb/src/query/stale-event.utils.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/stale-event.utils.ts#L83)

Judges whether a DELETE event is stale relative to the entity cache.

A DELETE event has no `patch`, but its `inversePatch` is the full snapshot from before the deletion (including `updatedAt`), which is enough for the same monotonicity comparison: if the entity in the cache is newer than this delete event (meaning an update event landed first after the deletion, or the delete itself is an old event replayed out of order), it must not be allowed to wipe the newer cached entity.

Returns `false` when the entity is not in the cache — nothing to compare against, so the deletion passes normally.

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type                                                                                             | Description                                                                  |
| --------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `rxdb`    | [`RxDB`](../classes/RxDB.md)                                                                     | The RxDB instance, used to resolve the entity type and read the entity cache |
| `event`   | [`RxDBEntityLocalRemovedEventData`](../interfaces/RxDBEntityLocalRemovedEventData.md)&lt;`T`&gt; | The local entity deletion event                                              |

## Returns

`boolean`
