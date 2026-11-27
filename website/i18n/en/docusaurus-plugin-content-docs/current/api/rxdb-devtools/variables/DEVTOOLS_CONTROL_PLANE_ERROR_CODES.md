# DEVTOOLS_CONTROL_PLANE_ERROR_CODES

```ts
const DEVTOOLS_CONTROL_PLANE_ERROR_CODES: readonly [
  'protocol_unsupported',
  'invalid_message',
  'invalid_identifier',
  'session_invalid',
  'session_closed',
  'session_budget_exhausted',
  'request_limit_exceeded',
  'transfer_limit_exceeded',
  'request_timeout',
  'transfer_timeout',
  'request_duplicate',
  'transfer_duplicate'
];
```

Defined in: [v2/errors.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L21)

Control-plane error codes (exactly 12).

## Remarks

The order matches the "Control-plane errors" section of US-904 phase B for item-by-item comparison.
