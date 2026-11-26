# closeOthers()

```ts
function closeOthers(state, key): TabsResult;
```

Defined in: [tabs/tabs-ops.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L138)

Closes all other tabs (keeps pinned tabs and the given tab).

## Parameters

| Parameter | Type                                      | Description          |
| --------- | ----------------------------------------- | -------------------- |
| `state`   | [`TabsState`](../interfaces/TabsState.md) | The current state.   |
| `key`     | `string`                                  | The tab key to keep. |

## Returns

[`TabsResult`](../interfaces/TabsResult.md)

The new state and a possible navigation URL.
