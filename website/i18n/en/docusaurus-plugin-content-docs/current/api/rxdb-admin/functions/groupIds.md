# groupIds()

```ts
function groupIds<T>(nodes): string[];
```

Defined in: [layout/menu.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L158)

The ids of all groups (nodes with children) in the menu, including nested groups, pre-order.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                          | Description    |
| --------- | ------------------------------------------------------------- | -------------- |
| `nodes`   | readonly [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[] | The menu tree. |

## Returns

`string`[]

The group ids.
