# isNil()

```ts
function isNil(value): value is null | undefined;
```

Defined in: [packages/utils/src/types/isNil.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isNil.ts#L20)

Checks whether a value is null or undefined
Uses strict equality (===) for comparison

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

value is null \| undefined

Returns true if the value is null or undefined, otherwise false

## Examples

```ts
isNil(null); // returns true
```

```ts
isNil(undefined); // returns true
```

```ts
isNil(0); // returns false (0 is not null or undefined)
```

```ts
isNil(''); // returns false (an empty string is not null or undefined)
```

```ts
isNil(false); // returns false (false is not null or undefined)
**Note:** this function uses the strict equality operator (===) for null and undefined checks
**Note:** unlike isEmpty: isNil checks only null and undefined, while isEmpty also checks empty strings, empty arrays, etc.
```
