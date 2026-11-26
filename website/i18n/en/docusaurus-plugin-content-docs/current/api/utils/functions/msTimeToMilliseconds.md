# msTimeToMilliseconds()

```ts
function msTimeToMilliseconds(value): number;
```

Defined in: [packages/utils/src/date/msTimeToMilliseconds.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/msTimeToMilliseconds.ts#L79)

Converts an ms time to milliseconds

value   https://github.com/vercel/ms

The input accepts both an `MSTime` string and a number that is already milliseconds — `ms(200)` takes the **reverse formatting** branch and returns the string `'200ms'`, while this function's declared return type is number (UTL-005). Numbers are therefore returned as-is instead of being handed to `ms()`.

Strings are first validated against MS\_TIME\_PATTERN (the same definition as `isMSTime`): `ms()` returns `undefined` for unparseable strings (again inconsistent with the declared number) and throws its own `Error` for the empty string. Rejecting uniformly at the entry keeps the error type deterministic.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `number` \| [`MSTime`](../type-aliases/MSTime.md) | ms time string or millisecond count |

## Returns

`number`

Milliseconds

## Throws

When the value cannot be parsed as a finite millisecond count

## Example

```ts
'2 days', '1d', '10h', 200
```
