# quoteLiteral()

```ts
function quoteLiteral(value): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L187)

Builds a SQL string literal out of a string.

## Parameters

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `value`   | `string` | The string text |

## Returns

`string`

The literal wrapped in single quotes with inner single quotes doubled

## Throws

RxDBError when the value contains NUL

## Remarks

Like [quoteIdentifier](quoteIdentifier.md), reuses the core [sqlStringLiteral](../../rxdb/functions/sqlStringLiteral.md) so the repository has exactly one set of criteria for "which inputs are rejected rather than escaped".
