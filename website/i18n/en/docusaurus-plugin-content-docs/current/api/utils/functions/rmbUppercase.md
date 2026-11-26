# rmbUppercase()

```ts
function rmbUppercase(value): string;
```

Defined in: [packages/utils/src/string/rmb.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/rmb.ts#L20)

Converts to uppercase RMB (Chinese currency) words

The fractional part is rounded to the li (thousandth of a yuan) and carries into the next yuan when full (`0.9999` → `one yuan exactly`).

## Parameters

| Parameter | Type     | Description                                    |
| --------- | -------- | ---------------------------------------------- |
| `value`   | `number` | The amount; negative numbers start with "owed" |

## Returns

`string`

The uppercase amount

## Throws

when value is not a finite number

## Throws

when the absolute value exceeds 10^22
