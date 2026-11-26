# openTab()

```ts
function openTab(state, tab, options): TabsState;
```

Defined in: [tabs/tabs-ops.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L81)

Opens (or activates) a tab: if it already exists its title is updated and it is activated; otherwise it is appended to the end of the unpinned area. When the limit is exceeded, the earliest unpinned, non-current tab is evicted.

## Parameters

| Parameter              | Type                                                   | Description                                                            |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `state`                | [`TabsState`](../interfaces/TabsState.md)              | The current state.                                                     |
| `tab`                  | [`TabItem`](../interfaces/TabItem.md)                  | The tab (`pinned` has no effect on an existing tab).                   |
| `options`              | \{ `maxCount`: `number`; `visitHistory`: `boolean`; \} | The tab limit (0 means unlimited) and whether to record visit history. |
| `options.maxCount`     | `number`                                               | -                                                                      |
| `options.visitHistory` | `boolean`                                              | -                                                                      |

## Returns

[`TabsState`](../interfaces/TabsState.md)

The new state.
