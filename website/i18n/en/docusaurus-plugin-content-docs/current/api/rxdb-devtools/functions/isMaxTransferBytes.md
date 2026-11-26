# isMaxTransferBytes()

```ts
function isMaxTransferBytes(value): value is number;
```

Defined in: [provider/limits.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/limits.ts#L22)

Checks whether a value is a valid `maxTransferBytes` (a non-negative safe integer from 0 to 1 GiB).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check. |

## Returns

`value is number`

`true` when the value conforms.
