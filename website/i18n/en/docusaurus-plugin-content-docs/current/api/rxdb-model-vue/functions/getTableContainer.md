# getTableContainer()

```ts
function getTableContainer(table): HTMLElement | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/vtable-compat.d.ts:29

Gets the table's DOM container element

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |

## Returns

`HTMLElement` \| `undefined`

The container element; returns undefined when VTable does not provide this method
