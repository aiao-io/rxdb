# getTableContainer()

```ts
function getTableContainer(table): HTMLElement | undefined;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts#L40)

Gets the table's DOM container element.

## Parameters

| Parameter | Type           | Description               |
| --------- | -------------- | ------------------------- |
| `table`   | `ListTableAll` | The target table instance |

## Returns

`HTMLElement` \| `undefined`

The container element; returns undefined when VTable does not provide this method.
