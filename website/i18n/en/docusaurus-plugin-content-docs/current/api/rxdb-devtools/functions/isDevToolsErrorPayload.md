# isDevToolsErrorPayload()

```ts
function isDevToolsErrorPayload(value): value is DevToolsErrorPayload;
```

Defined in: [v2/errors.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L161)

Checks whether a value is a legal outward error envelope.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is DevToolsErrorPayload`

`true` when exact-key and every field is compliant.
