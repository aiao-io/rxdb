# ALIPAY_UNDOCUMENTED_CAPABILITIES

```ts
const ALIPAY_UNDOCUMENTED_CAPABILITIES: readonly ["logic-layer-webassembly", "logic-layer-bigint", "worker-crypto-random", "object-prototype-global"];
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-capability.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-capability.ts#L17)

The undocumented capabilities the Alipay host depends on, kept item-for-item consistent with alipay's `undocumented` in the matrix YAML (checked by unit tests).

- `logic-layer-webassembly`: the logic layer's standard `WebAssembly` (the docs only mention `MYWebAssembly` inside Workers);
- `logic-layer-bigint`: the logic layer's native `BigInt`, absent from the simulator's global and recovered through the wasm i64-returning constructor;
- `worker-crypto-random`: `crypto.getRandomValues` inside a Worker, as the logic layer has no secure random source at all;
- `object-prototype-global`: obtaining the real global object through a getter on `Object.prototype` (the logic layer has no `globalThis`).
