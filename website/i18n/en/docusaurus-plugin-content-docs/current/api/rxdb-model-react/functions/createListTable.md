# createListTable()

```ts
function createListTable(
   container, 
   records, 
   columns, 
   isDarkMode, 
   options?, 
   i18n?
): ListTableAll;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-factory.d.ts:36

Creates a VTable ListTable instance

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `container` | `HTMLElement` | The mount container element |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | Table row data |
| `columns` | `ColumnsDefine` \| `undefined` | Column definitions |
| `isDarkMode` | `boolean` | Whether to use the dark theme |
| `options?` | `Partial`&lt;`ListTableConstructorOptions`&gt; | Additional options (optional), overriding the default configuration |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

`ListTableAll`

A ListTable instance with the base editors registered; the hidden input that receives keyboard focus has been given an accessible name
