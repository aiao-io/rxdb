# computeLayoutVars()

```ts
function computeLayoutVars(layout): Record<string, string>;
```

Defined in: [shell/root-binding.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L21)

The CSS variables the layout writes onto the root element; the stylesheet and the three framework shells share the same values.

## Parameters

| Parameter | Type                                          | Description         |
| --------- | --------------------------------------------- | ------------------- |
| `layout`  | [`LayoutState`](../interfaces/LayoutState.md) | The derived layout. |

## Returns

`Record`&lt;`string`, `string`&gt;

Variable name to value.
