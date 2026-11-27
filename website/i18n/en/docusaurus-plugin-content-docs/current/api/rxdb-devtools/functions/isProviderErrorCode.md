# isProviderErrorCode()

```ts
function isProviderErrorCode(
  value
): value is
  | 'permission_denied'
  | 'provider_unsupported'
  | 'provider_unavailable'
  | 'invalid_path'
  | 'resource_not_found'
  | 'resource_conflict'
  | 'storage_quota_exceeded'
  | 'payload_too_large'
  | 'payload_encoding_invalid'
  | 'transfer_sequence_invalid'
  | 'transfer_size_exceeded'
  | 'transfer_incomplete'
  | 'transfer_closed'
  | 'snapshot_expired'
  | 'snapshot_busy'
  | 'snapshot_too_large'
  | 'export_unsupported'
  | 'operation_failed';
```

Defined in: [v2/errors.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L117)

Checks whether a value is a provider error code.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

value is "permission\_denied" \| "provider\_unsupported" \| "provider\_unavailable" \| "invalid\_path" \| "resource\_not\_found" \| "resource\_conflict" \| "storage\_quota\_exceeded" \| "payload\_too\_large" \| "payload\_encoding\_invalid" \| "transfer\_sequence\_invalid" \| "transfer\_size\_exceeded" \| "transfer\_incomplete" \| "transfer\_closed" \| "snapshot\_expired" \| "snapshot\_busy" \| "snapshot\_too\_large" \| "export\_unsupported" \| "operation\_failed"

`true` when the value belongs to the provider union.
