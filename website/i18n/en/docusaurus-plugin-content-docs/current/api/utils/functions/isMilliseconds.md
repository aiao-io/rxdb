# isMilliseconds()

```ts
function isMilliseconds(value): value is number;
```

Defined in: [packages/utils/src/date/isMilliseconds.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/isMilliseconds.ts#L18)

Checks whether a value is a millisecond count

Complementary to [isMSTime](isMSTime.md): the latter only narrows the **string** forms of `ms` (`'1d'`, `'2 days'`); numbers go here. The two true-sets do not overlap (UTL-005).

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

`value is number`

`true` for finite numbers (`NaN` / `Infinity` have no duration semantics)

## Example

```ts
isMilliseconds(200); // true
isMilliseconds('200'); // false — that is an MSTime
```
