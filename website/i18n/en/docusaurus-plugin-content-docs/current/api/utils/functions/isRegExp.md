# isRegExp()

```ts
function isRegExp(value): value is RegExp;
```

Defined in: [packages/utils/src/types/isRegExp.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isRegExp.ts#L23)

Checks whether a value is a regular expression
Uses the instanceof operator

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

`value is RegExp`

Returns true if the value is a regular expression, otherwise false

## Examples

```ts
isRegExp(/abc/); // returns true
```

```ts
isRegExp(new RegExp('abc')); // returns true
```

```ts
isRegExp('/abc/'); // returns false (a string is not a regular expression)
```

```ts
isRegExp(null); // returns false (null is not a regular expression)
```

```ts
isRegExp(undefined); // returns false (undefined is not a regular expression)
```

```ts
isRegExp({}); // returns false (a plain object is not a regular expression)
**Note:** the function uses the instanceof operator to check for a RegExp instance
**Note:** both regex literals and regular expressions created via the RegExp constructor return true
**Note:** string-form regular expressions (e.g. '/abc/') are not recognized as regular expressions
```
