# isDate()

```ts
function isDate(value): value is Date;
```

Defined in: [packages/utils/src/types/isDate.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isDate.ts#L25)

Checks whether a value is a Date object
Determined using both instanceof and Object.prototype.toString.call()

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

`value is Date`

Returns true if the value is a Date object, otherwise false

## Examples

```ts
isDate(new Date()); // returns true
```

```ts
isDate(new Date('2023-01-01')); // returns true
```

```ts
isDate('2023-01-01'); // returns false (a string is not a Date object)
```

```ts
isDate(null); // returns false (null is not a Date object)
```

```ts
isDate(undefined); // returns false (undefined is not a Date object)
```

```ts
isDate({}); // returns false (a plain object is not a Date object)
```

```ts
isDate(new Date('invalid date')); // returns true (even an invalid date is a Date object)
**Note:** the function uses two checks: instanceof and Object.prototype.toString.call()
**Note:** for an invalid Date, the function still returns true because it is still a Date object
**Note:** unlike isDateString: this function checks for a Date object, not a date string
```
