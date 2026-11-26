# retitleTabs()

```ts
function retitleTabs(state, resolve): TabsState;
```

Defined in: [tabs/tabs-ops.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L219)

Updates tab titles via the resolve function (re-fetches menu titles after a language switch).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`TabsState`](../interfaces/TabsState.md) | The current state. |
| `resolve` | (`url`) => `string` \| `undefined` | Returns a title for a URL; returning `undefined` keeps the original title. |

## Returns

[`TabsState`](../interfaces/TabsState.md)

The new state; returns the original object when nothing changed.
