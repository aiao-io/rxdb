# deepFreeze()

```ts
function deepFreeze<T>(target): Readonly<T>;
```

Defined in: [packages/utils/src/object/deepFreeze.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/deepFreeze.ts#L62)

Deeply freezes an object and all its nested properties, making them immutable
Recursively walks all properties of the object and calls Object.freeze() on every object and function property

## Type Parameters

| Type Parameter                                       | Description     |
| ---------------------------------------------------- | --------------- |
| <a id="type-parameter-t"></a> `T` _extends_ `object` | The object type |

## Parameters

| Parameter | Type | Description                 |
| --------- | ---- | --------------------------- |
| `target`  | `T`  | The object to deeply freeze |

## Returns

`Readonly`&lt;`T`&gt;

The object itself, narrowed to `Readonly<T>`

## Examples

```ts
const obj = { a: { b: 1 } };
const frozen = deepFreeze(obj);
frozen.a.b = 2; // throws an error; the object is frozen
```

```ts
const arr = [1, { nested: 2 }];
const frozenArr = deepFreeze(arr);
frozenArr[1].nested = 3; // throws an error; the nested object is frozen
**Note:** primitive types (string, number, boolean, etc.) and null values are not frozen
**Note:** function objects are also frozen, preventing modification of their properties
**Note:** always returns the passed object itself (already-frozen objects are not frozen again)
**Note:** circular and diamond references both converge; no stack overflow
**Note:** both string and symbol keys are traversed (`Reflect.ownKeys`)
**Note:** keys, values, and elements referenced by `Map` / `Set` are frozen, but **the container's internal slots cannot be frozen**
— after freezing, `map.set()` / `map.delete()` / `set.add()` still work. The return type therefore only promises
`Readonly<T>`: `ReadonlyDeep<T>` would falsely claim at the type level that Map/Set contents are immutable (UTL-004).
```
