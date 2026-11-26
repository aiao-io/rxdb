# numberStep()

```ts
function numberStep(value, step): number;
```

Defined in: [packages/utils/src/number/numberStep.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/number/numberStep.ts#L30)

Rounds a number up to the nearest step multiple
Commonly used in form controls, grid layouts, and other scenarios that need values at fixed intervals

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `number` | The number to round |
| `step` | `number` | Step interval; must be a positive finite number |

## Returns

`number`

The rounded-up value, an integer multiple of step

## Throws

when step is not a positive finite number

## Examples

```ts
numberStep(7, 5);   // returns 10 (2 times 5)
```

```ts
numberStep(5, 5);   // returns 5 (1 times 5)
```

```ts
numberStep(3.2, 2); // returns 4 (2 times 2)
```

```ts
numberStep(0.28, 0.01); // returns 0.28 (already aligned; no extra step from the binary error of 0.28 / 0.01)
**Note:** value and step are computed in the integer domain using each one's shortest decimal notation (`String(n)`),
so the result matches decimal mental arithmetic without a floating-point tail; negative numbers also round up (`numberStep(-7, 3)` → -6);
NaN / ±Infinity values are returned as-is
```
