# toggleGroup()

```ts
function toggleGroup(
   open, 
   id, 
   siblings, 
   accordion
): Set<string>;
```

Defined in: [layout/menu.ts:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L191)

Toggles a group's expanded state; in accordion mode only one sibling stays expanded.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `open` | `ReadonlySet`&lt;`string`&gt; | The currently expanded group ids. |
| `id` | `string` | The id of the group being toggled. |
| `siblings` | readonly `string`[] | The ids of the groups at the same level as the toggled group (including itself). |
| `accordion` | `boolean` | Whether accordion mode is on. |

## Returns

`Set`&lt;`string`&gt;

The new expanded set.
