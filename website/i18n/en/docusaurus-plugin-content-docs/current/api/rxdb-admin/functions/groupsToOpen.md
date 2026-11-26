# groupsToOpen()

```ts
function groupsToOpen<T>(
   nodes, 
   url, 
   known?
): string[];
```

Defined in: [layout/menu.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L172)

The groups that a menu should additionally expand (on first appearance or after a change): among groups not seen before, those declared `expanded`, or those on the current URL's path.
Groups already seen are not expanded again, so groups the user collapsed are not reopened by menu updates; expanding the group that contains the current page on URL changes is still handled by [activeGroupIds](activeGroupIds.md).

Usage: on first render, bindings pass an empty `known`; afterwards, whenever the menu reference changes, merge the return value into the expanded set and update `known` to `groupIds(nodes)`.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodes` | readonly [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt;[] | The current menu tree. |
| `url` | `string` | The current URL. |
| `known?` | `ReadonlySet`&lt;`string`&gt; | Group ids seen before. |

## Returns

`string`[]

Group ids to merge into the expanded set.
