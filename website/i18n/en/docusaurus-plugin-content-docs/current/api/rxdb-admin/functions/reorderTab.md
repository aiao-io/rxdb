# reorderTab()

```ts
function reorderTab(
   state, 
   key, 
   toIndex
): TabsState;
```

Defined in: [tabs/tabs-ops.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L199)

Moves a tab to the target position; the target position is clamped within the tab's own group (pinned / unpinned).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`TabsState`](../interfaces/TabsState.md) | The current state. |
| `key` | `string` | The tab key. |
| `toIndex` | `number` | The target index (relative to the whole tab bar). |

## Returns

[`TabsState`](../interfaces/TabsState.md)

The new state.
