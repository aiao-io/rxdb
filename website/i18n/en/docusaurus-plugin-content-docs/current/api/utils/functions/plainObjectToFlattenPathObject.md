# plainObjectToFlattenPathObject()

```ts
function plainObjectToFlattenPathObject(object): Record<string, unknown>;
```

Defined in: [packages/utils/src/object/plainObjectToFlattenPathObject.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/plainObjectToFlattenPathObject.ts#L85)

Flattens a plain object into a path-keyed object

Empty arrays and empty objects are written as **leaves** (the value is just `[]` / `{}`), otherwise they would vanish during flattening and become indistinguishable from "the field does not exist" (UTL-012). An empty container at the root is not written, avoiding empty-string keys.

When the root is a plain object and no key contains `.` / `[` / `]`, the output can be restored verbatim by [flattenPathObjectToPlainObject](flattenPathObjectToPlainObject.md). When the root is an array, flattened keys start with `[i]`, but a restored root is always a plain object, so restoration throws a TypeError.

Sparse arrays: middle holes produce no keys (they remain holes after restoration); an array whose last position is a hole (including `new Array(n)`) cannot represent its length and throws outright instead of silently shortening or dropping. An explicit `undefined` is a position with a value and is written as a leaf as usual.

## Parameters

| Parameter | Type     | Description           |
| --------- | -------- | --------------------- |
| `object`  | `object` | The object to flatten |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The path-keyed object

## Throws

when the last position of a non-empty array at any level is a hole

## Example

```ts
plainObjectToFlattenPathObject({ a: { b: [0, 1] }, c: [], d: {} });
// `{ 'a.b[0]': 0, 'a.b[1]': 1, c: [], d: {} }`
```
