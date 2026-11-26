# getTableName()

```ts
function getTableName(entityName, namespace?): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table-name-resolver.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table-name-resolver.ts#L51)

Builds a fully qualified table name like `"public"."users"` (with double-quote escaping).

## Parameters

| Parameter    | Type     | Default value | Description                       |
| ------------ | -------- | ------------- | --------------------------------- |
| `entityName` | `string` | `undefined`   | Table name                        |
| `namespace?` | `string` | `'public'`    | Schema name, defaults to `public` |

## Returns

`string`

A double-quoted `"schema"."table"` string, safe to insert into SQL directly

## Remarks

Only concatenates strings; does not resolve table sets. Business entities always go through [getTableNameByMetadata](getTableNameByMetadata.md).
