# createProviderError()

```ts
function createProviderError(code): DevToolsErrorPayload;
```

Defined in: [v2/error-mapping.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/error-mapping.ts#L176)

Constructs a provider error according to the shared retryability table.

## Parameters

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Description              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `code`    | \| `"permission_denied"` \| `"provider_unsupported"` \| `"provider_unavailable"` \| `"invalid_path"` \| `"resource_not_found"` \| `"resource_conflict"` \| `"storage_quota_exceeded"` \| `"payload_too_large"` \| `"payload_encoding_invalid"` \| `"transfer_sequence_invalid"` \| `"transfer_size_exceeded"` \| `"transfer_incomplete"` \| `"transfer_closed"` \| `"snapshot_expired"` \| `"snapshot_busy"` \| `"snapshot_too_large"` \| `"export_unsupported"` \| `"operation_failed"` | The provider error code. |

## Returns

[`DevToolsErrorPayload`](../interfaces/DevToolsErrorPayload.md)

The corresponding error payload.

## Remarks

Provider errors produced by the protocol itself (transfer, snapshot, authorization) also go through here,
so that "the retryability of a given code" cannot diverge between platform mapping and protocol logic.
