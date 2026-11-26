# structuralEqual()

```ts
function structuralEqual(a, b): boolean;
```

Defined in: packages/rxdb-model/dist/structural-equal.d.ts:10

Structural deep comparison, replacing JSON.stringify comparison.
Recursively compares objects and arrays without depending on key serialization order.
Supports circular reference detection to avoid infinite recursion.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `a` | `unknown` | The first value to compare |
| `b` | `unknown` | The second value to compare |

## Returns

`boolean`

Returns true when the two are structurally equal
