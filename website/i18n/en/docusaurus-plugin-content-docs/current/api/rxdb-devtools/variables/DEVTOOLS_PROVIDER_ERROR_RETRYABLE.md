# DEVTOOLS_PROVIDER_ERROR_RETRYABLE

```ts
const DEVTOOLS_PROVIDER_ERROR_RETRYABLE: object;
```

Defined in: [v2/error-mapping.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/error-mapping.ts#L48)

Whether each provider error code is worth retrying by the peer.

## Type Declaration

### export\_unsupported \{#export_unsupported\}

```ts
readonly export_unsupported: false = false;
```

### invalid\_path \{#invalid_path\}

```ts
readonly invalid_path: false = false;
```

### operation\_failed \{#operation_failed\}

```ts
readonly operation_failed: false = false;
```

### payload\_encoding\_invalid \{#payload_encoding_invalid\}

```ts
readonly payload_encoding_invalid: false = false;
```

### payload\_too\_large \{#payload_too_large\}

```ts
readonly payload_too_large: false = false;
```

### permission\_denied \{#permission_denied\}

```ts
readonly permission_denied: false = false;
```

### provider\_unavailable \{#provider_unavailable\}

```ts
readonly provider_unavailable: true = true;
```

### provider\_unsupported \{#provider_unsupported\}

```ts
readonly provider_unsupported: false = false;
```

### resource\_conflict \{#resource_conflict\}

```ts
readonly resource_conflict: false = false;
```

### resource\_not\_found \{#resource_not_found\}

```ts
readonly resource_not_found: false = false;
```

### snapshot\_busy \{#snapshot_busy\}

```ts
readonly snapshot_busy: true = true;
```

### snapshot\_expired \{#snapshot_expired\}

```ts
readonly snapshot_expired: false = false;
```

### snapshot\_too\_large \{#snapshot_too_large\}

```ts
readonly snapshot_too_large: false = false;
```

### storage\_quota\_exceeded \{#storage_quota_exceeded\}

```ts
readonly storage_quota_exceeded: false = false;
```

### transfer\_closed \{#transfer_closed\}

```ts
readonly transfer_closed: false = false;
```

### transfer\_incomplete \{#transfer_incomplete\}

```ts
readonly transfer_incomplete: false = false;
```

### transfer\_sequence\_invalid \{#transfer_sequence_invalid\}

```ts
readonly transfer_sequence_invalid: false = false;
```

### transfer\_size\_exceeded \{#transfer_size_exceeded\}

```ts
readonly transfer_size_exceeded: false = false;
```

## Remarks

Only codes where "waiting a while might really help" are `true`. Quota exhaustion, illegal paths, and resource conflicts all require a person or an upper layer
to change the input; marking them retryable would induce the panel to spin in place.

Written as `satisfies Record<DevToolsProviderErrorCode, boolean>`: adding a new error code without taking a stance
fails to compile outright.
