# cloneDeep()

```ts
function cloneDeep<T>(value): T;
```

Defined in: [packages/utils/src/object/cloneDeep.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/cloneDeep.ts#L144)

Deep-clones a value.

A **single** object model: the prototype chain and property descriptors are always preserved, so `instanceof` is identical before and after cloning. The historical implementation was `try structuredClone / catch internal implementation`, and the same class would flip between "loses prototype" and "keeps prototype" as soon as it gained one function property (UTL-021); it has been removed.

Handled by category:

- Primitives and functions: returned as-is by reference (functions are not copied).
- `Date` / `RegExp` / `ArrayBuffer` / `DataView` / TypedArray: rebuilt as same-type instances. `DataView` rebuilds a sliced buffer, so `byteOffset` becomes zero while the byte contents are unchanged.
- `Map` / `Set` / `Array`: keys, values, and elements are copied recursively.
- Boxed primitives (`new String` etc.) and `Blob` / `File`: state lives in internal slots, delegated to `structuredClone`.
- Other objects: `Object.create(prototype)` + copying descriptors one by one via `Reflect.ownKeys`; symbol keys, getters/setters, and non-enumerable properties are preserved; function property values are kept by reference.

Circular and shared references are converged through a `WeakMap`, so shared structures in the copy stay shared.

**Known boundary**: other host objects such as `ImageData` / `ImageBitmap` / `MessagePort` are not in the explicit categories; they take the generic object branch, which copies only own properties with no semantic guarantee.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description       |
| --------- | ---- | ----------------- |
| `value`   | `T`  | The value to copy |

## Returns

`T`

The deep-cloned value

## Example

```ts
class A `{ x = 1; }`
cloneDeep(new A()) instanceof A; // true
```
