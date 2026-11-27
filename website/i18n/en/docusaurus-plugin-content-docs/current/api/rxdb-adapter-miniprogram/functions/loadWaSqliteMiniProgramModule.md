# loadWaSqliteMiniProgramModule()

```ts
function loadWaSqliteMiniProgramModule(options, host): Promise<WaSqliteEmscriptenModule>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/loader.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/loader.ts#L39)

Loads the synchronous wa-sqlite Emscripten module using the mini program WASM runtime.

## Parameters

| Parameter | Type                                                                                                                                            | Description                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `options` | `Pick`&lt;[`WaSqliteMiniProgramOptions`](../interfaces/WaSqliteMiniProgramOptions.md), `"moduleFactory"` \| `"wasmPath"` \| `"wasmRuntime"`&gt; | The module factory, the wasm path and the WASM runtime                                             |
| `host`    | [`MiniProgramWasmHost`](../type-aliases/MiniProgramWasmHost.md)                                                                                 | The host: `wasmRuntimeName` is used in errors, and `defaultWasmPath` when `wasmPath` is not passed |

## Returns

`Promise`&lt;[`WaSqliteEmscriptenModule`](../interfaces/WaSqliteEmscriptenModule.md)&gt;
