# isBoolean()

```ts
function isBoolean(value): value is boolean;
```

Defined in: [packages/utils/src/types/isBoolean.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isBoolean.ts#L15)

Checks whether a value is a boolean primitive.

**Accepts primitives only**: `new Boolean(false)` returns `false`. Wrapper objects are always truthy and never strictly equal to `false`; narrowing one to `boolean` would make `value === false` always false and `if (value)` always true — the compiler's view would contradict runtime semantics (UTL-007). Use [isBooleanLike](isBooleanLike.md) when wrapper objects must also be accepted.

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

`value is boolean`

Whether the value is a boolean primitive

## Example

```ts
isBoolean(false); // true
isBoolean(new Boolean(false)); // false
```
