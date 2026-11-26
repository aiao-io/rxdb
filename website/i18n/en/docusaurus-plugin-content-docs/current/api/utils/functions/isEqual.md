# isEqual()

```ts
function isEqual(a, b): boolean;
```

Defined in: [packages/utils/src/object/isEqual.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/isEqual.ts#L187)

Deeply compares two values for equality

Supports arrays / Uint8Array / Date / RegExp / Map / Set / wrapper types / plain objects,
and handles circular references safely.

Generic objects are compared by **own enumerable** keys; string keys and symbol keys are treated equally.

Known boundaries:

- Arrays are compared element by element; holes in sparse arrays are not equal to `undefined` (consistent with `createStableKey`).
- `Map` keys are compared by reference; only values are deeply compared (consistent with `Map#get` lookup semantics).
- Objects that only override `toString` (e.g. `URL`, `Error`) are compared by their `toString()` results.
- Non-enumerable properties do not participate in comparison (same rule for symbol and string keys).
- Reading values triggers getters; accessor properties are compared by their return values.

## Parameters

| Parameter | Type      | Description      |
| --------- | --------- | ---------------- |
| `a`       | `unknown` | The first value  |
| `b`       | `unknown` | The second value |

## Returns

`boolean`

Whether the values are deeply equal
