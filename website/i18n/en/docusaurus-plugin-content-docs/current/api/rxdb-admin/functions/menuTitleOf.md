# menuTitleOf()

```ts
function menuTitleOf<T>(nodes, url): string | undefined;
```

Defined in: [layout/menu.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L87)

The menu title for the current URL.

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

`string` \| `undefined`

The leaf node's title; returns `undefined` when there is no match.
