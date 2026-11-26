# isArray

```ts
const isArray: (arg) => arg is any[] = Array.isArray;
```

Defined in: [packages/utils/src/types/isArray.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isArray.ts#L19)

Checks whether a value is an array
A re-export of JavaScript's built-in Array.isArray function

## Parameters

| Parameter | Type  |
| --------- | ----- |
| `arg`     | `any` |

## Returns

`arg is any[]`

Returns true if the value is an array, otherwise false

## Examples

```ts
isArray([]); // returns true
```

```ts
isArray([1, 2, 3]); // returns true
```

```ts
isArray({}); // returns false (an object is not an array)
```

```ts
isArray(null); // returns false (null is not an array)
```

```ts
isArray("array"); // returns false (a string is not an array)
**Note:** this is a direct re-export of the native Array.isArray function and behaves exactly like it
```
