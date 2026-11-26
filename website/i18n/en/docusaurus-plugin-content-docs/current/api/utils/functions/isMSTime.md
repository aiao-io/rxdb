# isMSTime()

```ts
function isMSTime(value): value is MSTime;
```

Defined in: [packages/utils/src/date/isMSTime.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/isMSTime.ts#L24)

Checks whether a value is an ms time string

https://github.com/vercel/ms

`MSTime` is `ms.StringValue` and contains **strings only**. The original implementation returned `true` directly for numbers, making the narrowed set inconsistent with the declared type: passing a number through this predicate to `msTimeToMilliseconds()` yields the string `'200ms'` at runtime (UTL-005). Use [isMilliseconds](isMilliseconds.md) for numbers.

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

`value is MSTime`

`true` for a valid ms time string

## Example

```ts
isMSTime('2 days'); // true
isMSTime('100'); // true
isMSTime(200); // false — that is Milliseconds
```
