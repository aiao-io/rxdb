# isTableExistedSql()

```ts
function isTableExistedSql(tableName): object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L67)

Checks whether a sqlite table exists

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tableName` | `string` | Table name |

## Returns

`object`

Parameterized SQL statement and parameters

### params

```ts
params: [string];
```

### sql

```ts
sql: string;
```
