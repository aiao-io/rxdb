# isPlainObject()

```ts
function isPlainObject(object): object is object;
```

Defined in: [packages/utils/src/types/isPlainObject.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isPlainObject.ts#L27)

Checks whether a value is a plain object (an ordinary object created via the Object constructor)
Excludes special objects such as arrays, dates, regular expressions, Map, and Set

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `object`  | `unknown` | The value to check |

## Returns

`object is object`

Returns true if the value is a plain object, otherwise false

## Examples

```ts
isPlainObject({}); // returns true (an empty object)
```

```ts
isPlainObject({ name: 'John', age: 30 }); // returns true (an ordinary object with properties)
```

```ts
isPlainObject(new Object()); // returns true (an object created via the Object constructor)
```

```ts
isPlainObject([]); // returns false (an array is not a plain object)
```

```ts
isPlainObject(new Date()); // returns false (a Date object is not a plain object)
```

```ts
isPlainObject(null); // returns false (null is not an object)
```

```ts
isPlainObject(Object.create(null)); // returns true (objects with a null prototype count as plain objects)
```

```ts
isPlainObject(new Map()); // returns false (a Map object is not a plain object)
**Note:** the function checks the toString tag and the prototype chain to decide whether a value is a plain object
**Note:** unlike isObject: isObject covers all object types, while isPlainObject covers only ordinary objects
**Note:** objects with a null prototype (Object.create(null)) also count as plain objects
```
