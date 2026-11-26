# activeGroupIds()

```ts
function activeGroupIds<T>(nodes, url): string[];
```

Defined in: [layout/menu.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L144)

The group ids containing the current URL, used to initially expand the sidebar.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodes` | readonly [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[] | The menu tree. |
| `url` | `string` | The current URL. |

## Returns

`string`[]

The ids of the nodes on the path except the leaf.
