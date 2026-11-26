# canBeDate()

```ts
function canBeDate(value?): boolean;
```

Defined in: [packages/utils/src/date/canBeDate.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/canBeDate.ts#L10)

Checks whether a value can represent a valid date.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value?` | `unknown` | A Date, timestamp, or date string |

## Returns

`boolean`

Whether it can be converted to a finite timestamp; values outside the declared domain (bigint, Symbol, plain objects, arrays, functions, etc.) always return false without throwing
