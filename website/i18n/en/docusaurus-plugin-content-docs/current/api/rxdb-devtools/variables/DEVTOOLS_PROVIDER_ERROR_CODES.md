# DEVTOOLS_PROVIDER_ERROR_CODES

```ts
const DEVTOOLS_PROVIDER_ERROR_CODES: readonly [
  'provider_unsupported',
  'provider_unavailable',
  'invalid_path',
  'resource_not_found',
  'resource_conflict',
  'permission_denied',
  'storage_quota_exceeded',
  'payload_too_large',
  'payload_encoding_invalid',
  'transfer_sequence_invalid',
  'transfer_size_exceeded',
  'transfer_incomplete',
  'transfer_closed',
  'snapshot_expired',
  'snapshot_busy',
  'snapshot_too_large',
  'export_unsupported',
  'operation_failed'
];
```

Defined in: [v2/errors.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L46)

Provider data-plane error codes (exactly 18).

## Remarks

DOMException, Node/Rust error codes, and host-private errors must be mapped here; when a safe classification is impossible, use only
`operation_failed`. The transport must never invent platform-private codes on the fly — that is exactly where error divergence across the three platforms begins.
