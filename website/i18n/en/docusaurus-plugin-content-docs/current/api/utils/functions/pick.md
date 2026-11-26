# pick()

```ts
function pick<T, Keys>(obj, keys): Pick<T, Keys>;
```

Defined in: [packages/utils/src/object/pick.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/pick.ts#L25)

Picks the given properties from an object and returns a new object
Contains only the specified own properties; inherited and missing properties are ignored
Returns an empty object when the input is null/undefined

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` | The input object's type |
| <a id="type-parameter-keys"></a> `Keys` *extends* `string` \| `number` \| `symbol` | The set of property keys to pick |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `obj` | `T` | Source object; returns an empty object when null/undefined |
| `keys` | `Keys`[] | Array of property keys to pick |

## Returns

`Pick`&lt;`T`, `Keys`&gt;

A new object containing only the picked properties

## Examples

```ts
pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);
// returns `{ a: 1, c: 3 }`
```

```ts
pick({ name: 'John', age: 30 }, ['name']);
// returns `{ name: 'John' }`
```

```ts
pick(null, ['a', 'b']); // returns {}
```

```ts
pick({ a: 1 }, ['b']); // returns {} (the property does not exist)
**Note:** only the object's own properties are picked, not inherited ones
**Note:** missing properties are ignored and do not appear in the result
**Note:** picked keys are all written as own properties; a `__proto__` key does not change the prototype of the result
```
