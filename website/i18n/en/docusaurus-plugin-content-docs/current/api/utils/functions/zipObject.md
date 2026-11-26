# zipObject()

```ts
function zipObject<K, V>(keys, values): Record<K, V>;
```

Defined in: [packages/utils/src/object/zipObject.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/zipObject.ts#L29)

Creates an object by pairing a key array with a value array / function
Supports multiple value sources: a fixed value, a value array, or a value-generating function

## Type Parameters

| Type Parameter                                                               | Description                                     |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| <a id="type-parameter-k"></a> `K` _extends_ `string` \| `number` \| `symbol` | The key type; must be string, number, or symbol |
| <a id="type-parameter-v"></a> `V`                                            | The value type                                  |

## Parameters

| Parameter | Type                                    | Description                                                                                                                                                                                                           |
| --------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`    | `K`[]                                   | The array of keys                                                                                                                                                                                                     |
| `values`  | `V` \| ((`key`, `idx`) => `V`) \| `V`[] | The value source, which can be: - a fixed value: all keys use the same value - a value array: values are assigned to keys by index - a value-generating function: values are generated dynamically from key and index |

## Returns

`Record`&lt;`K`, `V`&gt;

The resulting object

## Examples

```ts
zipObject(['a', 'b'], [1, 2]); // returns `{ a: 1, b: 2 }`
```

```ts
zipObject(['a', 'b'], (key, idx) => key + idx); // returns `{ a: 'a0', b: 'b1' }`
```

```ts
zipObject(['a', 'b'], 'default'); // returns `{ a: 'default', b: 'default' }`
```

```ts
zipObject([], [1, 2]); // returns {} (empty key array)
```

```ts
zipObject(['x', 'y'], [10]); // returns { x: 10, y: undefined } (value array too short)
**Note:** if the value array is shorter than the key array, the extra keys get `undefined`
**Note:** if the value-generating function throws, the error propagates
**Note:** an empty key array returns an empty object
**Note:** every key is written as an own property; a `__proto__` key does not alter the result's prototype
```
