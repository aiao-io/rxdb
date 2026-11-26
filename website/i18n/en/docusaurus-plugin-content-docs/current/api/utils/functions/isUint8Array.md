# isUint8Array()

```ts
function isUint8Array(value): value is Uint8Array<ArrayBufferLike>;
```

Defined in: [packages/utils/src/types/isUint8Array.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isUint8Array.ts#L25)

Checks whether a value is a Uint8Array
Uses the instanceof operator

## Parameters

| Parameter | Type      | Description        |
| --------- | --------- | ------------------ |
| `value`   | `unknown` | The value to check |

## Returns

`value is Uint8Array<ArrayBufferLike>`

Returns true if the value is a Uint8Array, otherwise false

## Examples

```ts
isUint8Array(new Uint8Array([1, 2, 3])); // returns true
```

```ts
isUint8Array(new Uint8Array(0)); // returns true (empty Uint8Array)
```

```ts
isUint8Array([]); // returns false (an array is not a Uint8Array)
```

```ts
isUint8Array(null); // returns false (null is not a Uint8Array)
```

```ts
isUint8Array(undefined); // returns false (undefined is not a Uint8Array)
```

```ts
isUint8Array(new ArrayBuffer(8)); // returns false (ArrayBuffer is not a Uint8Array)
```

```ts
isUint8Array(new Uint16Array()); // returns false (Uint16Array is not a Uint8Array)
**Note:** the function uses the instanceof operator to check for a Uint8Array instance
**Note:** Uint8Array is an 8-bit unsigned integer typed array with values from 0 to 255
**Note:** difference from ArrayBuffer: a Uint8Array is a view over an ArrayBuffer, providing typed access to the binary data
```
