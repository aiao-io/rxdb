# canBeNumber()

```ts
function canBeNumber(value): boolean;
```

Defined in: [packages/utils/src/number/canBeNumber.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/number/canBeNumber.ts#L9)

Checks whether a value is a finite number or a complete decimal digit string.

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

`boolean`

Whether it can be losslessly recognized as a finite decimal number
