# isTableEditing()

```ts
function isTableEditing(table): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts#L54)

Checks whether the table is currently being edited.

## Parameters

| Parameter | Type           | Description               |
| --------- | -------------- | ------------------------- |
| `table`   | `ListTableAll` | The target table instance |

## Returns

`boolean`

true when an active editor exists.
