# buildTableOptions()

```ts
function buildTableOptions(
   records, 
   columns, 
   isDarkMode, 
   options?
): ListTableConstructorOptions;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-factory.d.ts:25

Builds ListTable initialization options

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | Table row data |
| `columns` | `ColumnsDefine` \| `undefined` | Column definitions |
| `isDarkMode` | `boolean` | Whether to use the dark theme |
| `options?` | `Partial`&lt;`ListTableConstructorOptions`&gt; | Additional options (optional), overriding the default configuration |

## Returns

`ListTableConstructorOptions`

ListTable constructor options
