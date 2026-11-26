# findActiveRoot()

```ts
function findActiveRoot<T>(nodes, url): MenuNode<T> | undefined;
```

Defined in: [layout/menu.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L97)

The top-level node that owns the current URL.

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

[`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt; \| `undefined`

The top-level node; returns `undefined` when nothing matches.
