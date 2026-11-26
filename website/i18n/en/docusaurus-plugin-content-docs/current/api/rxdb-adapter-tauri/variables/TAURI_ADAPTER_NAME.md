# TAURI_ADAPTER_NAME

```ts
const TAURI_ADAPTER_NAME: "sqlite-tauri";
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-adapter.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-adapter.interface.ts#L25)

Name of the adapter in the `RxDBAdapters` registry.

## Remarks

`satisfies` pins it to the shared layer's registry: changing this name while
`DESKTOP_HOST_ADAPTER_NAMES` does not follow is a compile error, not an `adapter_mismatch` some
downstream only discovers at runtime.
