# closeAll()

```ts
function closeAll(state): TabsResult;
```

Defined in: [tabs/tabs-ops.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L174)

Closes all unpinned tabs; when the current tab is closed, it falls back to the first pinned tab.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`TabsState`](../interfaces/TabsState.md) | The current state. |

## Returns

[`TabsResult`](../interfaces/TabsResult.md)

The new state and a possible navigation target.
