# createAlipayWasmRuntime()

```ts
function createAlipayWasmRuntime(my, webAssembly): MiniProgramWasmRuntime;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.ts#L113)

The wasm runtime of the Alipay logic layer: fetches bytes via readAlipayCodePackageWasm and hands them to the standard `WebAssembly.instantiate`.

The Alipay docs only mention `MYWebAssembly` inside Workers; the logic layer's standard `WebAssembly` is what was actually measured
(the matrix `undocumented` entry `logic-layer-webassembly`). Creating the runtime does not read files; both file-read and source-selection errors become rejections.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `my` | `Pick`&lt;[`MiniProgramAlipayApi`](../interfaces/MiniProgramAlipayApi.md), `"base64ToArrayBuffer"` \| `"getFileSystemManager"`&gt; | The Alipay global `my` |
| `webAssembly` | [`AlipayStandardWasmApi`](../interfaces/AlipayStandardWasmApi.md) | The logic layer's standard `WebAssembly` |

## Returns

[`MiniProgramWasmRuntime`](../interfaces/MiniProgramWasmRuntime.md)
