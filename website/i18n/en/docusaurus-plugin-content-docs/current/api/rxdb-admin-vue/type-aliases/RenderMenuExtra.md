# RenderMenuExtra

```ts
type RenderMenuExtra = (props) => unknown;
```

Defined in: [types.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/types.ts#L28)

Scoped slot signature for extra content on the right of menu items (badges, counts), corresponding to React's `renderMenuExtra`.
On [AdminLayout](../variables/AdminShellProvider.md) / [Sidebar](../variables/AdminShellProvider.md) the slot is named `menu-extra`; on [MenuTree](../variables/AdminShellProvider.md) it is `extra`.

## Parameters

| Parameter    | Type                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| `props`      | \{ `node`: [`MenuNode`](../../rxdb-admin/interfaces/MenuNode.md)&lt;`Component`&gt;; \} |
| `props.node` | [`MenuNode`](../../rxdb-admin/interfaces/MenuNode.md)&lt;`Component`&gt;                |

## Returns

`unknown`
