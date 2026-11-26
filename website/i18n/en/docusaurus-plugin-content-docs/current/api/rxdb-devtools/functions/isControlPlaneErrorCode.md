# isControlPlaneErrorCode()

```ts
function isControlPlaneErrorCode(value): value is "protocol_unsupported" | "invalid_message" | "invalid_identifier" | "session_invalid" | "session_closed" | "session_budget_exhausted" | "request_limit_exceeded" | "transfer_limit_exceeded" | "request_timeout" | "transfer_timeout" | "request_duplicate" | "transfer_duplicate";
```

Defined in: [v2/errors.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L107)

Checks whether a value is a control plane error code.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check. |

## Returns

value is "protocol\_unsupported" \| "invalid\_message" \| "invalid\_identifier" \| "session\_invalid" \| "session\_closed" \| "session\_budget\_exhausted" \| "request\_limit\_exceeded" \| "transfer\_limit\_exceeded" \| "request\_timeout" \| "transfer\_timeout" \| "request\_duplicate" \| "transfer\_duplicate"

`true` when the value belongs to the control plane union.
