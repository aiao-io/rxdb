# getSwitchUpdatedAt()

```ts
function getSwitchUpdatedAt(known): Date;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L106)

Computes the `updatedAt` to write for the UPDATE of a branch switch (undo / redo).

undo/redo is itself **a write**; `updatedAt` records the write moment, not the user's logical state, so the old value from the historical patch cannot be reused: once it goes backwards, LWW sync would treat undo as a stale write and drop it, and the query cache that deduplicates by `id@updatedAt` fingerprints would swallow this emission too.

Returns `max(now, ...known + 1ms, watermark + 1ms)`:
- `known` comes from the patch / inversePatch of this change and covers the case where "the previous write was a normal save" (`getMonotonicUpdatedAt` allows `updatedAt` to lead the wall clock, so taking only `now` is not enough);
- `watermark` covers the case where "the previous write was itself an undo/redo step" — that write never entered history, and only the in-process watermark knows about it.

Kept symmetric with the function of the same name in `@aiao/rxdb-adapter-sqlite-core`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `known` | readonly `unknown`[] | Candidate `updatedAt` values for the row known from history (Date / ISO string / millisecond count) |

## Returns

`Date`
