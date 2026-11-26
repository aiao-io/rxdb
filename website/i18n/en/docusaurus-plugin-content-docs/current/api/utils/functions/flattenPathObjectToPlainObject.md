# flattenPathObjectToPlainObject()

```ts
function flattenPathObjectToPlainObject(value): Record<string, unknown>;
```

Defined in: [packages/utils/src/object/flattenPathObjectToPlainObject.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/flattenPathObjectToPlainObject.ts#L99)

Converts a flat path object into a nested plain object; the inverse of [plainObjectToFlattenPathObject](plainObjectToFlattenPathObject.md)

The container type is determined by the path syntax: a container reached via a canonical index `[n]` is an array, and a container reached via a property name (including `a.0`, `a[01]`) is an object; the root is always a plain object. Contradictory paths throw directly instead of silently dropping data.

## Parameters

| Parameter | Type                                | Description                                   |
| --------- | ----------------------------------- | --------------------------------------------- |
| `value`   | `Record`&lt;`string`, `unknown`&gt; | An object whose keys are dot or bracket paths |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The converted nested object

## Throws

A path contains a `__proto__` / `prototype` / `constructor` segment

## Throws

A path is empty, or a root-level segment is an array index (e.g. `[0]`)

## Throws

The same container mixes indexes and property names (`a[0]` and `a.b`), or the same position is both a leaf and a container (`a` and `a.b`)

## Example

```ts
flattenPathObjectToPlainObject({ 'a.b[0]': 1, 'a.c.0': 2 }); // { a: { b: [1], c: { '0': 2 } } }
```
