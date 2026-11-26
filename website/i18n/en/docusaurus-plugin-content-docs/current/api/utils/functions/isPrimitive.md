# isPrimitive()

```ts
function isPrimitive(value): value is string | number | bigint | boolean | symbol | null | undefined;
```

Defined in: [packages/utils/src/types/isPrimitive.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isPrimitive.ts#L33)

Checks whether a value is a JavaScript primitive type
JavaScript primitive types include null, undefined, strings, numbers, booleans, symbols, and bigints

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

value is string \| number \| bigint \| boolean \| symbol \| null \| undefined

Returns true if the value is a primitive type, otherwise false

## Examples

```ts
isPrimitive(null); // returns true
```

```ts
isPrimitive(undefined); // returns true
```

```ts
isPrimitive('hello'); // returns true (a string is a primitive type)
```

```ts
isPrimitive(123); // returns true (a number is a primitive type)
```

```ts
isPrimitive(true); // returns true (a boolean is a primitive type)
```

```ts
isPrimitive(Symbol('foo')); // returns true (a symbol is a primitive type)
```

```ts
isPrimitive(BigInt(123)); // returns true (a bigint is a primitive type)
```

```ts
isPrimitive({}); // returns false (an object is not a primitive type)
```

```ts
isPrimitive([]); // returns false (an array is not a primitive type)
```

```ts
isPrimitive(() => {}); // returns false (a function is not a primitive type)
```

```ts
isPrimitive(new Date()); // returns false (a Date object is not a primitive type)
**Note:** the function uses the typeof operator plus a null check to decide whether a value is a primitive
**Note:** primitives are immutable values without methods or properties (although JavaScript allows accessing their wrapper-object methods)
**Note:** the implementation uses `value == null` to check for both null and undefined
```
