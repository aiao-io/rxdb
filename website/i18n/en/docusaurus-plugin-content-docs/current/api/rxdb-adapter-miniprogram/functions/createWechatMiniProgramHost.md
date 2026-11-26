# createWechatMiniProgramHost()

```ts
function createWechatMiniProgramHost(wechat): MiniProgramHost;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/host.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/host.ts#L161)

Adapts the WeChat global `wx` into a [MiniProgramHost](../interfaces/MiniProgramHost.md).

Capability names and error text match the US-209 WeChat path verbatim. When `wx` fields are missing the corresponding getters return
`undefined`, letting the runtime precheck list the missing items instead of throwing `TypeError` here.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `wechat` | [`MiniProgramWechatApi`](../interfaces/MiniProgramWechatApi.md) |

## Returns

[`MiniProgramHost`](../interfaces/MiniProgramHost.md)
