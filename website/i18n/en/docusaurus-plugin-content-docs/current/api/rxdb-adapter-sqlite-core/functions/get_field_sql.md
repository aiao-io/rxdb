# get_field_sql()

```ts
function get_field_sql(originalField, aliasField?, entityMetadata?, tableAlias?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:294](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L294)

Gets the SQL representation of a field

## Parameters

| Parameter         | Type                                                                                  | Default value      | Description                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `originalField`   | `string`                                                                              | `undefined`        | -                                                                                                                          |
| `aliasField?`     | `string`                                                                              | `undefined`        | -                                                                                                                          |
| `entityMetadata?` | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | `undefined`        | -                                                                                                                          |
| `tableAlias?`     | `string`                                                                              | `MAIN_TABLE_ALIAS` | Which table alias fields of the current table without an alias mapping hang on, defaulting to the top-level main table `_` |

## Returns

`string`
