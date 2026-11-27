# createAlipayMiniProgramHost()

```ts
function createAlipayMiniProgramHost(my, options): MiniProgramHost;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay.ts#L68)

Adapts the Alipay global `my` into a host.

- File system: converts "failure returned as an error object" into thrown exceptions; reads and writes go through base64, user files carry a 1-byte frame header (the simulator rejects empty writes),
  so the on-disk format differs from other platforms; platforms never shared data directories anyway.
- Random numbers: obtained through `randomWorker`; a fresh request is needed per bootstrap (the logic layer has no native random source).
- Runtime: `prepareRuntime` checks the logic layer's `WebAssembly` and fills in `BigInt` and `queueMicrotask`;
  the real global object is located on demand when reading `runtimeGlobal`. Missing undocumented capabilities throw, without degrading.

When `my` fields are missing, the corresponding getters return `undefined`, letting the runtime precheck list the missing items.

## Parameters

| Parameter | Type                                                                            | Description                                                                            |
| --------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `my`      | [`MiniProgramAlipayApi`](../interfaces/MiniProgramAlipayApi.md)                 | The Alipay global `my`                                                                 |
| `options` | [`AlipayMiniProgramHostOptions`](../interfaces/AlipayMiniProgramHostOptions.md) | The random Worker, the logic layer's `WebAssembly`, and an optional real global object |

## Returns

[`MiniProgramHost`](../interfaces/MiniProgramHost.md)
