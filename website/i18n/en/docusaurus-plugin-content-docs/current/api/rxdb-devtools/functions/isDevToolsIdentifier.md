# isDevToolsIdentifier()

```ts
function isDevToolsIdentifier(value): value is string;
```

Defined in: [v2/ids.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/ids.ts#L74)

Checks whether a value is a legal `requestId` / `transferId`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check. |

## Returns

`value is string`

`true` when compliant.

## Remarks

Restricted to 1 to 128 ASCII characters from `[A-Za-z0-9._:-]`. The narrowed character set lets identifiers be safely spliced into
logs, file names, and internal map keys without each site doing its own escaping.
