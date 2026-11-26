# ELECTRON_ADAPTER_NAME

```ts
const ELECTRON_ADAPTER_NAME: 'sqlite-electron';
```

Defined in: [packages/rxdb-adapter-electron/src/electron-adapter.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-electron/src/electron-adapter.interface.ts#L25)

The adapter's name in the `RxDBAdapters` registry.

## Remarks

`satisfies` pins it to the shared layer's registry: changing this name without updating `DESKTOP_HOST_ADAPTER_NAMES` is a compile error, not an `adapter_mismatch` some downstream discovers at runtime.
