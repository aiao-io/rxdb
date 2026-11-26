# createDouyinMiniProgramHost()

```ts
function createDouyinMiniProgramHost(tt, options?): MiniProgramHost;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/douyin.ts#L47)

Adapts the Douyin global `tt` into a [MiniProgramHost](../interfaces/MiniProgramHost.md).

The chunked storage layout (64 KiB) and the absolute wasm path at the code package root are fixed declarations; for the rationale see the US-211 experiment v9 report;
the user directory comes from `tt.getEnvInfoSync()` rather than the deprecated `tt.env`; when `tt` fields are missing the corresponding getters return `undefined`,
letting the runtime precheck list the missing items, and `getEnvInfoSync`'s platform-native exceptions are not swallowed.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tt` | [`MiniProgramDouyinApi`](../interfaces/MiniProgramDouyinApi.md) | The Douyin global `tt` |
| `options?` | [`DouyinMiniProgramHostOptions`](../interfaces/DouyinMiniProgramHostOptions.md) | An optional real global object |

## Returns

[`MiniProgramHost`](../interfaces/MiniProgramHost.md)
