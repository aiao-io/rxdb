# isObject()

```ts
function isObject(value): value is object;
```

Defined in: [packages/utils/src/types/isObject.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isObject.ts#L22)

Checks whether a value is a plain object (created via the Object constructor)
Excludes special objects such as arrays, null, dates, and regular expressions

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check |

## Returns

`value is object`

Returns true if the value is a plain object, otherwise false

## Examples

```ts
isObject({}); // returns true
```

```ts
isObject({ a: 1 }); // returns true
```

```ts
isObject([]); // returns false (an array is not a plain object)
```

```ts
isObject(null); // returns false (null is not an object)
```

```ts
isObject(new Date()); // returns false (a Date object is not a plain object)
```

```ts
isObject(Object.create(null)); // returns false (no constructor property)
**Note:** this function checks `value.constructor === Object`, so it does not recognize objects created via Object.create(null)
**Note:** unlike isObjectLike: isObjectLike only checks whether the value is a non-null object, while isObject additionally requires it to be created via the Object constructor
```
