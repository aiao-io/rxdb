# isString()

```ts
function isString(value): value is string;
```

Defined in: [packages/utils/src/types/isString.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isString.ts#L22)

Checks whether a value is a string
Determined with the typeof operator; returns a boolean

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

`value is string`

Returns true if the value is a string, otherwise false

## Examples

```ts
isString('hello'); // returns true
```

```ts
isString(''); // returns true (an empty string is still a string)
```

```ts
isString(123); // returns false (a number is not a string)
```

```ts
isString(null); // returns false (null is not a string)
```

```ts
isString(undefined); // returns false (undefined is not a string)
```

```ts
isString(new String('hello')); // returns false (a String object is not a string literal)
**Note:** uses the typeof operator; a String object yields 'object', not 'string'
**Note:** string literals and the empty string both return true
```
