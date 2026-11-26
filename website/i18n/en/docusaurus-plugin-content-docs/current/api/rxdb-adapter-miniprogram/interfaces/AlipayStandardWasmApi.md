# AlipayStandardWasmApi

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L56)

The subset of the standard `WebAssembly` present in the logic layer.

The Alipay docs only mention `MYWebAssembly` inside Workers (instantiating by code package path); the logic layer's standard `WebAssembly` has no documented promise,
but was measured on both the simulator and iOS: the matrix `undocumented` entry `logic-layer-webassembly`.

## Methods

### instantiate() \{#instantiate\}

```ts
instantiate(bytes, imports): Promise<{
  instance: {
     exports: WebAssembly.Exports;
  };
  module?: unknown;
}>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L57)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array`&lt;`ArrayBuffer`&gt; |
| `imports` | `WebAssembly.Imports` |

#### Returns

`Promise`&lt;\{
  `instance`: \{
     `exports`: `WebAssembly.Exports`;
  \};
  `module?`: `unknown`;
\}&gt;
