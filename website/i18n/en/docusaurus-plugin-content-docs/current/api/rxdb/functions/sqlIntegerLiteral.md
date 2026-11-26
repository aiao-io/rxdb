# sqlIntegerLiteral()

```ts
function sqlIntegerLiteral(value): string;
```

Defined in: [packages/rxdb/src/system/sql-literal.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sql-literal.ts#L83)

Formats an integer as an SQL numeric literal.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `number` | The integer value (branch generation, headRevision, etc.) |

## Returns

`string`

The decimal literal

## Remarks

Only safe integers are accepted. `NaN` / `Infinity` would format into identifiers rather than numbers (and happen to be legal
floating-point input on PostgreSQL), and `1e21` would format in exponent form — all three pass syntax checks and then compare into wrong results.

## Throws

[RxDBError](../classes/RxDBError.md) when the value is not a safe integer
