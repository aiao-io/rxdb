# MiniProgramRuntimeCapabilityOptions

```ts
type MiniProgramRuntimeCapabilityOptions = Pick<
  WaSqliteMiniProgramBaseOptions,
  'moduleFactory' | 'wasmRuntime' | 'databaseRoot'
> &
  MiniProgramHostSelection;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/runtime-capabilities.ts#L23)

Config needed by the runtime precheck: module factory, WASM runtime, host, and an optional database directory.

When `databaseRoot` is given, the host is no longer required to provide a user data directory.
