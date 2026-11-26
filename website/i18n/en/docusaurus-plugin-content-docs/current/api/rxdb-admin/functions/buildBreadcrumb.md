# buildBreadcrumb()

```ts
function buildBreadcrumb<T>(
   nodes, 
   url, 
   home?
): BreadcrumbItem<T>[];
```

Defined in: [layout/menu.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L122)

Builds the breadcrumb.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodes` | readonly [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[] | The menu tree. |
| `url` | `string` | The current URL. |
| `home?` | [`BreadcrumbItem`](../interfaces/BreadcrumbItem.md)&lt;`T`&gt; | The home item; when provided it becomes the first item (corresponds to `breadcrumb.showHome`). |

## Returns

[`BreadcrumbItem`](../interfaces/BreadcrumbItem.md)&lt;`T`&gt;[]

The breadcrumb items; returns an empty array when there is no match.
