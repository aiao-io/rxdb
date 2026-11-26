# isBooleanLike()

```ts
function isBooleanLike(value): value is boolean | BooleanObject;
```

Defined in: [packages/utils/src/types/isBoolean.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isBoolean.ts#L38)

Checks whether a value is a boolean primitive **or** a `Boolean` wrapper object.

The predicate narrows to `boolean | BooleanObject`; callers must call `.valueOf()` explicitly to get the boolean value, so there is no silent error from a "wrapper object treated as primitive `false`".

Determined by the `Object.prototype.toString` tag rather than calling `value.valueOf()`: only objects that truly hold `[[BooleanData]]` return that tag, and null-prototype objects have no `valueOf`, so calling it would be a `TypeError`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

value is boolean \| BooleanObject

Whether it is a boolean primitive or a boolean wrapper object

## Example

```ts
const raw: unknown = new Boolean(false);
if (isBooleanLike(raw) && raw.valueOf() === false) `{ ... }`
```
