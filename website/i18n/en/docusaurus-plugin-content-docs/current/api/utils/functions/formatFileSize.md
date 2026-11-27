# formatFileSize()

```ts
function formatFileSize(bytes): string;
```

Defined in: [packages/utils/src/file/index.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/file/index.ts#L19)

Formats a byte count into a readable string with units.

Units stop at `GB`: larger values keep using GB; TB never appears. Values keep two decimal places. Invalid input does **not throw** — it always degrades to `'0 B'` for easy direct rendering.

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `bytes`   | `number` | Byte count  |

## Returns

`string`

A string like `'1.5 MB'`; returns `'0 B'` when `bytes` is `NaN` / `Infinity` / negative / `0`

## Example

```ts
formatFileSize(1536); // '1.5 KB'
formatFileSize(-1); // '0 B'
```
