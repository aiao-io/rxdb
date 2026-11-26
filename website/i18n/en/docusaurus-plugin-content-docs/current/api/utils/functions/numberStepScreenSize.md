# numberStepScreenSize()

```ts
function numberStepScreenSize(
   value, 
   step?, 
   devicePixelRatio?
): number;
```

Defined in: [packages/utils/src/number/numberStepScreenSize.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/number/numberStepScreenSize.ts#L16)

Adjusts a value by the device pixel ratio, then rounds to the step size
Mainly for size calculations on screens with different DPI, keeping an appropriate step on high-resolution screens

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `value` | `number` | `undefined` | The original value |
| `step?` | `number` | `80` | Step interval; defaults to 80 |
| `devicePixelRatio?` | `number` | `1` | Device pixel ratio; defaults to 1, used for adjusting on high-DPI screens |

## Returns

`number`

The adjusted value

## Example

```ts
numberStepScreenSize(100, 50, 2); // returns 200 (100*2=200, rounded up to a multiple of 50)
numberStepScreenSize(75, 50, 1);  // returns 100 (75 rounded up to a multiple of 50)
**Note:** multiplies value by devicePixelRatio first, then applies the numberStep logic
**Note:** suitable for size calculations in responsive design
```
