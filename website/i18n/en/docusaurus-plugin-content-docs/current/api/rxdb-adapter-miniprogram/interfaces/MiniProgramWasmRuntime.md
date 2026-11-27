# MiniProgramWasmRuntime

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L157)

The WASM runtime provided by the mini program platform (WeChat `WXWebAssembly`, Douyin `TTWebAssembly`).

## Methods

### instantiate() \{#instantiate\}

```ts
instantiate(path, imports): Promise<
  | MiniProgramWasmInstance
  | {
  instance: MiniProgramWasmInstance;
  module?: unknown;
}>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L158)

#### Parameters

| Parameter | Type                  |
| --------- | --------------------- |
| `path`    | `string`              |
| `imports` | `WebAssembly.Imports` |

#### Returns

`Promise`&lt;
\| [`MiniProgramWasmInstance`](MiniProgramWasmInstance.md)
\| \{
`instance`: [`MiniProgramWasmInstance`](MiniProgramWasmInstance.md);
`module?`: `unknown`;
\}&gt;
