# togglePin()

```ts
function togglePin(state, key): TabsState;
```

Defined in: [tabs/tabs-ops.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L186)

Toggles the pinned state; pinned tabs are grouped at the front, keeping their relative order.

## Parameters

| Parameter | Type                                      | Description        |
| --------- | ----------------------------------------- | ------------------ |
| `state`   | [`TabsState`](../interfaces/TabsState.md) | The current state. |
| `key`     | `string`                                  | The tab key.       |

## Returns

[`TabsState`](../interfaces/TabsState.md)

The new state.
