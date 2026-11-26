# prepareIncrementalUpdate()

```ts
function prepareIncrementalUpdate<T, RT>(task, data): IncrementalUpdateContext<T>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L289)

Prepares the incremental merge context for a batch of UPDATE events.

This is **the entry primitive for plugins implementing incremental merge**: after a plugin (such as a tree query) gets the task and this batch of events,
it first calls this to obtain `{ cache, classification }`, then decides how to modify `task.result` according to its own task type.

It encapsulates three purely internal assembly points — how a full entity is deserialized, which `where` predicate is used, and how the cache is built.
Keeping these three internal has real binding force: the `where` judgment must be based on the **full entity**; patch/inversePatch are only
incremental fields, and judging from a bare patch under a compound `where` would always evaluate false due to missing fields, causing newlyUnmatchedIds
to be undercounted and `count` to silently drift. If each plugin wired it up itself, each would write its own judgment, and drift would never raise an error.

Once in the baseline it is subject to compatibility commitments, see `website/docs/versioning.md`.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | - |
| <a id="type-parameter-rt"></a> `RT` | `unknown` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `task` | [`QueryTask`](../classes/QueryTask.md)&lt;`T`, `RT`&gt; | The query task being merged; an empty `task.options.where` is treated as match-all |
| `data` | [`RxDBEntityLocalUpdatedEventData`](../interfaces/RxDBEntityLocalUpdatedEventData.md)&lt;`T`&gt;[] | The batch of local UPDATE events |

## Returns

[`IncrementalUpdateContext`](../interfaces/IncrementalUpdateContext.md)&lt;`T`&gt;
