# buildTableOptions()

```ts
function buildTableOptions(
   records, 
   columns, 
   isDarkMode, 
   options?
): ListTableConstructorOptions;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-factory.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-factory.ts#L68)

Builds the ListTable initialization options.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] | The table row data |
| `columns` | `ColumnsDefine` \| `undefined` | The column definitions |
| `isDarkMode` | `boolean` | Whether dark theme is active |
| `options?` | `Partial`&lt;`ListTableConstructorOptions`&gt; | Extra options (optional), overriding the default configuration |

## Returns

`ListTableConstructorOptions`

The ListTable constructor options
