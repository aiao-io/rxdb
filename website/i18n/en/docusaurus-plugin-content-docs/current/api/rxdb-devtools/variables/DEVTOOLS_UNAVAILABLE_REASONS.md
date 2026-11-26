# DEVTOOLS_UNAVAILABLE_REASONS

```ts
const DEVTOOLS_UNAVAILABLE_REASONS: readonly ["not_configured", "permission_denied", "runtime_unsupported", "initialization_failed"];
```

Defined in: [provider/descriptor.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/descriptor.ts#L67)

Shared reason codes required when `kind: 'unavailable'`.

## Remarks

Shared rather than per-platform free text: the panel decides the hint text and whether to offer a retry entry based on the reason;
free text would turn this branch into string matching.
