# sqlBooleanLiteral()

```ts
function sqlBooleanLiteral(value): string;
```

Defined in: [packages/rxdb/src/system/sql-literal.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sql-literal.ts#L101)

Formats a boolean as an SQL boolean literal.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `boolean` | The boolean value |

## Returns

`string`

`'true'` or `'false'`

## Remarks

PostgreSQL has a native `boolean`; SQLite has recognized the `TRUE` / `FALSE` keywords since 3.23 and evaluates them to 1 / 0,
which happens to equal the storage shape of this repository's `PropertyType.boolean` on SQLite (INTEGER 0/1).
So the same literal is correct on both sides, with no need to fork into `1` / `0` per backend.
