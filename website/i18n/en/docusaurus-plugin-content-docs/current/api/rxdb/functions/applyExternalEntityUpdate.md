# applyExternalEntityUpdate()

```ts
function applyExternalEntityUpdate<T>(entity, patch): void;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L76)

Merges an external event's incremental patch into the cached entity, without recording it as the user's local modification.

P0-004 (UPDATE path): this goes through `EntityStatus.replace`'s
`Object.assign(this.target, patch)` — **bypassing the Proxy**, resetting `_origin`, zeroing `_modified`.
If the patch is older than the entity cache, it must not be applied regardless of whether the entity is currently dirty or clean: a dirty entity would be rolled back together with
the user's unsaved edits; a clean entity would be silently reverted to old field values and the cached updatedAt watermark would regress — likewise
data loss, just without the "re-edit into the same value" trigger condition.

The discriminator is purely timestamp monotonicity (`isStaleEventPayload`), no longer distinguishing the modified state. The earlier concern
was that undo/redo would write an `updatedAt` older than the replaced row (`HistoryManager` recomputes via `max(Date.now(), …)`,
without consulting the entity's current `updatedAt`) — but P1-011 (2026-07-29) has already changed undo/redo at the adapter layer
(`getSwitchUpdatedAt` in `switch-result.utils.ts`: max across the current clock / known candidate value +1ms / in-process watermark +1ms,
three-way) to write a monotonically increasing new timestamp, no longer a "replay of the old value" — the measured premise that once overturned the pure
timestamp guard no longer holds.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance in the cache |
| `patch` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | The external event payload (incremental fields) |

## Returns

`void`
