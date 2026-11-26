# closeTab()

```ts
function closeTab(state, key): TabsResult;
```

Defined in: [tabs/tabs-ops.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L126)

Closes a tab; pinned tabs cannot be closed. When closing the current tab, the most recently visited tab is chosen as the next one; with no history, the right neighbor is taken, then the left neighbor.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`TabsState`](../interfaces/TabsState.md) | The current state. |
| `key` | `string` | The tab key. |

## Returns

[`TabsResult`](../interfaces/TabsResult.md)

The new state and a possible navigation URL.
