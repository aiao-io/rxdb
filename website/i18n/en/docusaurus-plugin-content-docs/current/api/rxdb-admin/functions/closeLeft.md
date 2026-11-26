# closeLeft()

```ts
function closeLeft(state, key): TabsResult;
```

Defined in: [tabs/tabs-ops.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L149)

Closes the unpinned tabs to the left of the given tab.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`TabsState`](../interfaces/TabsState.md) | The current state. |
| `key` | `string` | The reference tab key. |

## Returns

[`TabsResult`](../interfaces/TabsResult.md)

The new state and a possible navigation URL.
