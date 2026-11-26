# StorageBackendErrorCode

```ts
type StorageBackendErrorCode = 
  | "backend_unavailable"
  | "invalid_physical_name"
  | "name_too_long"
  | "permission_denied"
  | "disk_full"
  | "write_aborted"
  | "adapter_mismatch"
  | "backend_internal_error";
```

Defined in: [packages/rxdb-plugin-storage/src/errors.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/errors.ts#L170)

The stable discriminator code for backend (including desktop host) failures.

## Remarks

A dedicated set of codes instead of reusing error class names: these failures
must cross IPC, structured clone does not preserve the prototype chain, and the
receiving side can only discriminate by string codes.
