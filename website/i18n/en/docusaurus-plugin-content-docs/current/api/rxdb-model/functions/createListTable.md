# createListTable()

```ts
function createListTable(container, records, columns, isDarkMode, options?, i18n?): ListTableAll;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-factory.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-factory.ts#L104)

Creates a VTable ListTable instance.

## Parameters

| Parameter    | Type                                                        | Description                                                    |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `container`  | `HTMLElement`                                               | The container element to mount into                            |
| `records`    | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The table row data                                             |
| `columns`    | `ColumnsDefine` \| `undefined`                              | The column definitions                                         |
| `isDarkMode` | `boolean`                                                   | Whether dark theme is active                                   |
| `options?`   | `Partial`&lt;`ListTableConstructorOptions`&gt;              | Extra options (optional), overriding the default configuration |
| `i18n?`      | [`ModelI18n`](../interfaces/ModelI18n.md)                   | -                                                              |

## Returns

`ListTableAll`

A ListTable instance with the base editors registered; the hidden input that receives keyboard focus has been given an accessible name.
