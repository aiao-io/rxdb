# findMenuPath()

```ts
function findMenuPath<T>(nodes, url): MenuNode<T>[];
```

Defined in: [layout/menu.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L65)

Finds the menu path (root to leaf) that the URL lives on. The longest route prefix wins, and for the same route the deeper node is taken; the root path `/` only matches exactly.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                          | Description      |
| --------- | ------------------------------------------------------------- | ---------------- |
| `nodes`   | readonly [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[] | The menu tree.   |
| `url`     | `string`                                                      | The current URL. |

## Returns

[`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[]

The path; an empty array when nothing matches.
