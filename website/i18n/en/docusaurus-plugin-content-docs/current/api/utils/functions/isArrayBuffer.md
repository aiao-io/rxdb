# isArrayBuffer()

```ts
function isArrayBuffer(value): value is ArrayBuffer;
```

Defined in: [packages/utils/src/types/isArrayBuffer.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isArrayBuffer.ts#L23)

Checks whether a value is an ArrayBuffer
Uses the instanceof operator

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

`value is ArrayBuffer`

Returns true if the value is an ArrayBuffer, otherwise false

## Examples

```ts
isArrayBuffer(new ArrayBuffer(8)); // returns true
```

```ts
isArrayBuffer(new ArrayBuffer(0)); // returns true (empty ArrayBuffer)
```

```ts
isArrayBuffer([]); // returns false (an array is not an ArrayBuffer)
```

```ts
isArrayBuffer(null); // returns false (null is not an ArrayBuffer)
```

```ts
isArrayBuffer(undefined); // returns false (undefined is not an ArrayBuffer)
```

```ts
isArrayBuffer(new Uint8Array()); // returns false (Uint8Array is not an ArrayBuffer)
**Note:** the function uses the instanceof operator to check for an ArrayBuffer instance
**Note:** ArrayBuffer represents a generic, fixed-length buffer of raw binary data
**Note:** difference from TypedArray (e.g. Uint8Array): ArrayBuffer is the raw binary data, while a TypedArray is a view over it
```
