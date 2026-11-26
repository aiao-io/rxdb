# validateSqliteNumericOption()

```ts
function validateSqliteNumericOption(name, value, defaultValue, options?): number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L57)

Validates an integer numeric option of a SQLite client.

## Parameters

| Parameter            | Type                           | Description                        |
| -------------------- | ------------------------------ | ---------------------------------- |
| `name`               | `string`                       | The option name                    |
| `value`              | `unknown`                      | The runtime input value            |
| `defaultValue`       | `number`                       | The default used when not provided |
| `options?`           | \{ `allowZero?`: `boolean`; \} | Whether zero is allowed            |
| `options.allowZero?` | `boolean`                      | -                                  |

## Returns

`number`

The validated integer value
