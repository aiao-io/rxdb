# flattenMenu()

```ts
function flattenMenu<T>(nodes): MenuNode<T>[];
```

Defined in: [layout/menu.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L77)

Expands into a list of nodes with routes (pre-order).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                          | Description    |
| --------- | ------------------------------------------------------------- | -------------- |
| `nodes`   | readonly [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[] | The menu tree. |

## Returns

[`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[]

Nodes that have a `route`.
