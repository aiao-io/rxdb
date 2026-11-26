# structuralEqual()

```ts
function structuralEqual(a, b): boolean;
```

Defined in: [packages/rxdb-model/src/structural-equal.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/structural-equal.ts#L10)

Structural deep comparison, replacing JSON.stringify comparison.
Recursively compares objects and arrays, independent of key serialization order.
Supports circular reference detection to avoid infinite recursion.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `a` | `unknown` | The first value to compare |
| `b` | `unknown` | The second value to compare |

## Returns

`boolean`

Returns true when the two are structurally equal.
